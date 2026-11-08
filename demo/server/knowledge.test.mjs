// @vitest-environment node
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { newDb } from 'pg-mem'
import { describe, expect, it, vi } from 'vitest'
import { createHandler } from './handler.mjs'
import { AIR_LIMITS, createKnowledge, summarizeHistory } from './knowledge.mjs'
import { AIR_QUALITY_LIMITS } from '../src/lib/airQuality'

const seedPath = fileURLToPath(new URL('../public/plants/seed_all.json', import.meta.url))
const silent = { error: () => {} }

const geminiReply = (obj) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) })
const fakeGemini = (reply) => vi.fn(async () => (typeof reply === 'function' ? reply() : geminiReply(reply)))

function pool() {
  const { Pool } = newDb().adapters.createPg()
  return new Pool()
}

describe('plant knowledge in the Tiger database', () => {
  it('creates the table and stores all 12 plants, and a second start changes nothing', async () => {
    const p = pool()
    // (the in-memory Postgres cannot repeat CREATE TABLE IF NOT EXISTS; real Postgres can)
    let created = false
    const once = { query: (sql, params) => (created && sql.includes('CREATE TABLE') ? Promise.resolve({ rows: [] }) : ((created = created || sql.includes('CREATE TABLE')), p.query(sql, params))) }
    const k = createKnowledge({ pool: once, seedPath, log: silent })
    expect((await k.init()).stored).toBe(12)
    expect((await k.init()).stored).toBe(12)
    expect((await p.query('SELECT count(*)::int AS n FROM plant_types')).rows[0].n).toBe(12)
    const plants = await k.list()
    expect(plants).toHaveLength(12)
    expect(k.source()).toBe('tiger')
    const dracaena = plants.find((x) => x.plant_type_id === 'dracaena')
    expect(dracaena.thresholds.soil_moisture).toEqual({ min: 15, max: 60 }) // thresholds stay structured
  })

  it('serves the seed file when there is no database, or the database is broken', async () => {
    const none = createKnowledge({ seedPath, log: silent })
    expect(await none.list()).toHaveLength(12)
    const broken = createKnowledge({ pool: { query: async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }) } }, seedPath, log: silent })
    expect((await broken.init()).error).toBe(true)
    expect(await broken.list()).toHaveLength(12)
    expect(broken.source()).toBe('seed')
  })
})

describe('matching a spoken plant name with Gemini', () => {
  const make = (reply) => {
    const fetchImpl = fakeGemini(reply)
    return { fetchImpl, k: createKnowledge({ seedPath, gemini: { apiKey: 'key' }, fetchImpl, log: silent }) }
  }

  it('returns the plant Gemini picked, with the key in a header (not the URL)', async () => {
    const { k, fetchImpl } = make({ plant_type_id: 'dracaena', confidence: 0.93 })
    expect(await k.match('the corn plant')).toEqual({ plant_type_id: 'dracaena', confidence: 0.93 })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).not.toContain('key')
    expect(init.headers['x-goog-api-key']).toBe('key')
    expect(JSON.parse(init.body).contents[0].parts[0].text).toContain('the corn plant')
  })

  it('treats "none", an invented id, and low confidence as no match', async () => {
    expect(await make({ plant_type_id: 'none', confidence: 0.9 }).k.match('my cactus')).toBeNull()
    expect(await make({ plant_type_id: 'unicorn_tree', confidence: 0.99 }).k.match('unicorn')).toBeNull()
    expect(await make({ plant_type_id: 'dracaena', confidence: 0.2 }).k.match('hmm')).toBeNull()
  })

  it('asks once more when Gemini returns cut-off JSON, and then gives up', async () => {
    let n = 0
    const flaky = make(() => (n++ === 0 ? { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"plant_type_id":"dra' }] } }] }) } : geminiReply({ plant_type_id: 'dracaena', confidence: 0.9 })))
    expect((await flaky.k.match('dracaena'))?.plant_type_id).toBe('dracaena')
    expect(flaky.fetchImpl).toHaveBeenCalledTimes(2)
    const broken = make(() => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{' }] } }] }) }))
    await expect(broken.k.match('dracaena')).rejects.toMatchObject({ status: 502 })
    expect(broken.fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not call Gemini for empty speech', async () => {
    const { k, fetchImpl } = make({ plant_type_id: 'dracaena', confidence: 1 })
    expect(await k.match('   ')).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('errors cleanly when Gemini is missing, down, or returns junk', async () => {
    const k0 = createKnowledge({ seedPath, log: silent })
    await expect(k0.match('pothos')).rejects.toMatchObject({ status: 503 })
    await expect(make(() => ({ ok: false, status: 500 })).k.match('pothos')).rejects.toMatchObject({ status: 502 })
    await expect(make(() => { throw new Error('network') }).k.match('pothos')).rejects.toMatchObject({ status: 502 })
    await expect(make(() => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) })).k.match('pothos')).rejects.toMatchObject({ status: 502 })
  })
})

describe('answering a question with Gemini', () => {
  it('gives Gemini the plant notes and the live readings, and returns a short answer', async () => {
    const fetchImpl = fakeGemini({ answer: 'Water it now.' })
    const k = createKnowledge({ seedPath, gemini: { apiKey: 'key' }, fetchImpl, log: silent })
    const out = await k.ask({ plantTypeId: 'dracaena', question: 'should I water it?', metrics: { soil_moisture: 7.26, temp_c: 22 }, healthScore: 61 })
    expect(out.answer).toBe('Water it now.')
    expect(out.based_on).toEqual(['soil_moisture=7.3', 'temp_c=22'])
    const prompt = JSON.parse(fetchImpl.mock.calls[0][1].body).contents[0].parts[0].text
    expect(prompt).toContain('Dracaena')
    expect(prompt).toContain('soil moisture % 7.3')
    expect(prompt).toContain('should I water it?')
    expect(prompt).toContain('Known fixes')
  })

  it('knows the same air-quality limits the screen alerts on, so "is the air ok?" agrees with the alert', async () => {
    for (const [metric, limit] of Object.entries(AIR_LIMITS)) expect(AIR_QUALITY_LIMITS[metric].max).toBe(limit)
    const fetchImpl = fakeGemini({ answer: 'The air is stale.' })
    const k = createKnowledge({ seedPath, gemini: { apiKey: 'key' }, fetchImpl, log: silent })
    await k.ask({ plantTypeId: 'dracaena', question: 'is the air ok?', metrics: { co2_ppm: 1600 } })
    const prompt = JSON.parse(fetchImpl.mock.calls[0][1].body).contents[0].parts[0].text
    expect(prompt).toContain('CO2 above 1500 ppm is stale air')
    expect(prompt).toContain('CO2 ppm 1600')
  })

  it('rejects an empty question and an unknown plant without calling Gemini', async () => {
    const fetchImpl = fakeGemini({ answer: 'x' })
    const k = createKnowledge({ seedPath, gemini: { apiKey: 'key' }, fetchImpl, log: silent })
    await expect(k.ask({ plantTypeId: 'dracaena', question: '  ' })).rejects.toMatchObject({ status: 400 })
    await expect(k.ask({ plantTypeId: 'nope', question: 'hi' })).rejects.toMatchObject({ status: 404 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('caps very long questions before they reach Gemini', async () => {
    const fetchImpl = fakeGemini({ answer: 'ok' })
    const k = createKnowledge({ seedPath, gemini: { apiKey: 'key' }, fetchImpl, log: silent })
    await k.ask({ plantTypeId: 'dracaena', question: 'a'.repeat(5000) })
    const prompt = JSON.parse(fetchImpl.mock.calls[0][1].body).contents[0].parts[0].text
    expect(prompt.length).toBeLessThan(4500)
  })
})

describe('the /api routes', () => {
  async function serve(knowledge, extra = {}) {
    const server = createServer(createHandler({ distDir: '/nonexistent', knowledge, ...extra }))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }
  }
  const post = (base, path, body, headers = {}) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

  it('lists plants, matches by voice text, and answers questions', async () => {
    const k = createKnowledge({ seedPath, gemini: { apiKey: 'key' }, fetchImpl: vi.fn(async (u, init) => (init.body.includes('Question') ? geminiReply({ answer: 'Fine.' }) : geminiReply({ plant_type_id: 'panda_plant', confidence: 0.9 }))), log: silent })
    const s = await serve(k)
    expect((await (await fetch(`${s.base}/api/plants`)).json()).plants).toHaveLength(12)
    expect((await (await post(s.base, '/api/plants/match', { utterance: 'panda' })).json()).match.plant_type_id).toBe('panda_plant')
    const ans = await (await post(s.base, '/api/ask', { plant_type_id: 'panda_plant', question: 'ok?', metrics: { temp_c: 21 } })).json()
    expect(ans.answer).toBe('Fine.')
    await s.close()
  })

  it('reports no match as match:null, bad input as 400/404, and Gemini trouble as 502 (the device then uses its local matcher)', async () => {
    const k = createKnowledge({ seedPath, gemini: { apiKey: 'key' }, fetchImpl: vi.fn(async () => ({ ok: false, status: 500 })), log: silent })
    const s = await serve(k)
    expect((await post(s.base, '/api/plants/match', { utterance: 'pothos' })).status).toBe(502)
    expect((await post(s.base, '/api/plants/match', { utterance: '' })).status).toBe(200) // empty speech -> no Gemini, match null
    expect((await post(s.base, '/api/ask', { plant_type_id: 'zzz', question: 'hi' })).status).toBe(404)
    expect((await post(s.base, '/api/ask', { plant_type_id: 'panda_plant', question: '' })).status).toBe(400)
    const bad = await fetch(`${s.base}/api/ask`, { method: 'POST', body: '{nope' })
    expect(bad.status).toBe(400)
    await s.close()
  })

  it('has no Gemini wired: 503 for the AI routes, while plants still list', async () => {
    const k = createKnowledge({ seedPath, log: silent })
    const s = await serve(k)
    expect((await post(s.base, '/api/plants/match', { utterance: 'pothos' })).status).toBe(503)
    expect((await fetch(`${s.base}/api/plants`)).status).toBe(200)
    await s.close()
    const s2 = await serve(null)
    expect((await fetch(`${s2.base}/api/plants`)).status).toBe(503)
    await s2.close()
  })

  it('only our own pages or listed origins may call it, and the AI routes are rate limited', async () => {
    const k = createKnowledge({ seedPath, gemini: { apiKey: 'key' }, fetchImpl: fakeGemini({ plant_type_id: 'dracaena', confidence: 0.9 }), log: silent })
    const pi = 'http://localhost:3000'
    const s = await serve(k, { allowedOrigins: [pi], now: () => 5_000_000 })
    const evil = await post(s.base, '/api/plants/match', { utterance: 'x' }, { Origin: 'https://evil.example' })
    expect(evil.status).toBe(403)
    const ok = await post(s.base, '/api/plants/match', { utterance: 'dracaena' }, { Origin: pi })
    expect(ok.headers.get('access-control-allow-origin')).toBe(pi)
    expect((await fetch(`${s.base}/api/plants/match`, { method: 'OPTIONS', headers: { Origin: pi } })).status).toBe(204)
    let last
    for (let i = 0; i < 32; i++) last = await post(s.base, '/api/plants/match', { utterance: 'dracaena' })
    expect(last.status).toBe(429)
    expect((await fetch(`${s.base}/api/plants`, { method: 'POST' })).status).toBe(405) // POST to a read route never reaches transcribe
    await s.close()
  })
})

describe('history and trends for answers', () => {
  const NOW = Date.UTC(2026, 10, 8, 12, 0, 0)
  const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString()
  const row = (h, soil, co2) => ({ ts: hoursAgo(h), metrics: { soil_moisture: soil, co2_ppm: co2, temp_c: 22 } })

  it('summarizes a drying pot as falling, a flat metric as steady, and says nothing without enough data', () => {
    const rows = [row(23, 50, 600), row(18, 44, 610), row(12, 35, 590), row(6, 22, 600), row(1, 9, 605)]
    const lines = summarizeHistory(rows, NOW).join('\n')
    expect(lines).toContain('5 readings over the last 23 h')
    expect(lines).toContain('soil moisture %: first 50, latest 9, low 9, high 50, falling')
    expect(lines).toContain('air temp C: first 22, latest 22, low 22, high 22, steady')
    expect(lines).toMatch(/CO2 ppm:.*steady/)
    expect(summarizeHistory([row(2, 40, 600), row(1, 39, 600)], NOW)).toEqual([])
    expect(summarizeHistory([], NOW)).toEqual([])
    expect(summarizeHistory(null, NOW)).toEqual([])
  })

  it('rising is reported as rising', () => {
    const lines = summarizeHistory([row(20, 10, 500), row(10, 30, 900), row(1, 55, 1700)], NOW).join('\n')
    expect(lines).toMatch(/soil moisture %:.*rising/)
    expect(lines).toMatch(/CO2 ppm:.*rising/)
  })

  async function withReadings(rows) {
    const p = pool()
    await p.query('CREATE TABLE readings (device_id text NOT NULL, ts timestamptz NOT NULL, received_at timestamptz, fw text, metrics jsonb NOT NULL)')
    for (const r of rows) await p.query('INSERT INTO readings (device_id, ts, metrics) VALUES ($1, $2, $3)', [r.device, r.ts, JSON.stringify(r.metrics)])
    return p
  }

  it('reads the last 24 h of this pot from Tiger and hands the trend to Gemini', async () => {
    const p = await withReadings([
      ...[23, 18, 12, 6, 1].map((h, i) => ({ device: 'esp32-pot-01', ts: hoursAgo(h), metrics: { soil_moisture: [50, 44, 35, 22, 9][i], temp_c: 22 } })),
      { device: 'esp32-pot-01', ts: hoursAgo(30), metrics: { soil_moisture: 99 } }, // older than a day: left out
      { device: 'other-pot', ts: hoursAgo(2), metrics: { soil_moisture: 1 } }, // another pot: left out
    ])
    const fetchImpl = fakeGemini({ answer: 'It has been drying out.' })
    const k = createKnowledge({ pool: p, seedPath, gemini: { apiKey: 'key' }, fetchImpl, now: () => NOW, log: silent })
    const out = await k.ask({ plantTypeId: 'dracaena', question: 'why is it wilting?', metrics: { soil_moisture: 9 } })
    expect(out.answer).toBe('It has been drying out.')
    const prompt = JSON.parse(fetchImpl.mock.calls[0][1].body).contents[0].parts[0].text
    expect(prompt).toContain('History: 5 readings')
    expect(prompt).toContain('soil moisture %: first 50, latest 9, low 9, high 50, falling')
    expect(prompt).not.toContain('99')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).systemInstruction.parts[0].text).toContain('trend')
  })

  it('asks about the pot named in the request, rejects odd device ids, and still answers when the history cannot be read', async () => {
    const p = await withReadings([{ device: 'pot-b', ts: hoursAgo(5), metrics: { soil_moisture: 30 } }, { device: 'pot-b', ts: hoursAgo(3), metrics: { soil_moisture: 31 } }, { device: 'pot-b', ts: hoursAgo(1), metrics: { soil_moisture: 32 } }])
    const k = createKnowledge({ pool: p, seedPath, gemini: { apiKey: 'key' }, fetchImpl: fakeGemini({ answer: 'ok' }), now: () => NOW, log: silent })
    expect((await k.history('pot-b')).length).toBe(3)
    expect(await k.history('esp32-pot-01')).toEqual([])
    expect(await k.history("x'; DROP TABLE readings;--")).toEqual([])
    const broken = createKnowledge({ pool: { query: async () => { throw new Error('db down') } }, seedPath, gemini: { apiKey: 'key' }, fetchImpl: fakeGemini({ answer: 'still works' }), log: silent })
    expect((await broken.ask({ plantTypeId: 'dracaena', question: 'hi' })).answer).toBe('still works')
  })

  it('tells Gemini the light and mineral ranges exist but are not measured', async () => {
    const fetchImpl = fakeGemini({ answer: 'ok' })
    const k = createKnowledge({ seedPath, gemini: { apiKey: 'key' }, fetchImpl, log: silent })
    await k.ask({ plantTypeId: 'dracaena', question: 'does it get enough light?', metrics: {} })
    const prompt = JSON.parse(fetchImpl.mock.calls[0][1].body).contents[0].parts[0].text
    expect(prompt).toMatch(/NOT measured by this device.*light \d+ to \d+ lux.*soil minerals \(EC\) \d+ to \d+/)
  })
})
