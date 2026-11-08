import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { newDb } from 'pg-mem'
import { createHandler, normalizeReading } from './handler.mjs'
import { MemoryStore, PgStore } from './store.mjs'

const NOW = 1_800_000_000 // fixed "now" in epoch seconds
const TOKEN = 'test-token'

const reading = (over = {}) => ({
  device_id: 'esp32-pot-01',
  ts: NOW - 60,
  received_ts: NOW - 55,
  fw: '0.1.0',
  metrics: { temp_c: 22, rh_pct: 45, co2_ppm: 600, soil_moisture: 40 },
  ...over,
})

function pgStore() {
  const { Pool } = newDb().adapters.createPg()
  return new PgStore(new Pool())
}

// The same behaviour must hold for the in-memory store and the real SQL (run on an in-memory Postgres).
for (const [name, makeStore] of [['MemoryStore', () => new MemoryStore()], ['PgStore (SQL)', pgStore]]) {
  describe(`ingest service with ${name}`, () => {
    let server, base, store
    beforeEach(async () => {
      store = makeStore()
      await store.init()
      server = createServer(createHandler({ store, token: TOKEN, now: () => NOW }))
      await new Promise((r) => server.listen(0, '127.0.0.1', r))
      base = `http://127.0.0.1:${server.address().port}`
    })
    afterEach(async () => {
      await new Promise((r) => server.close(r))
    })

    const post = (body, token = TOKEN, raw) =>
      fetch(`${base}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: raw ?? JSON.stringify(body),
      })

    it('stores a batch exactly as the Pi relays it', async () => {
      const res = await post({ readings: [reading(), reading({ ts: NOW - 660, received_ts: NOW - 655 })] })
      assert.equal(res.status, 200)
      assert.deepEqual(await res.json(), { received: 2, stored: 2, duplicates: 0, rejected: 0 })
      const dev = await (await fetch(`${base}/api/devices`)).json()
      assert.equal(dev.devices.length, 1)
      assert.equal(dev.devices[0].device_id, 'esp32-pot-01')
      assert.equal(dev.devices[0].metrics.co2_ppm, 600)
      assert.equal(new Date(dev.devices[0].ts).getTime(), (NOW - 60) * 1000) // newest of the two
    })

    it('a retried batch does not create duplicates', async () => {
      await post({ readings: [reading()] })
      const again = await (await post({ readings: [reading()] })).json()
      // (the in-memory Postgres used here over-reports inserts on a conflict; real Postgres returns no row)
      if (name === 'MemoryStore') assert.deepEqual(again, { received: 1, stored: 0, duplicates: 1, rejected: 0 })
      const h = await (await fetch(`${base}/api/readings?device_id=esp32-pot-01`)).json()
      assert.equal(h.readings.length, 1)
    })

    it('rejects a missing or wrong token, and never opens up when no token is configured', async () => {
      assert.equal((await post({ readings: [reading()] }, null)).status, 401)
      assert.equal((await post({ readings: [reading()] }, 'nope')).status, 401)
      const open = createServer(createHandler({ store, token: undefined, now: () => NOW }))
      await new Promise((r) => open.listen(0, '127.0.0.1', r))
      const res = await fetch(`http://127.0.0.1:${open.address().port}/ingest`, { method: 'POST', body: '{}' })
      assert.equal(res.status, 503)
      await new Promise((r) => open.close(r))
      assert.equal((await (await fetch(`${base}/api/devices`)).json()).devices.length, 0)
    })

    it('drops unusable records but keeps the good ones in the same batch', async () => {
      const res = await post({
        readings: [
          reading(),
          { device_id: 'bad id!', ts: NOW, metrics: { temp_c: 1 } },
          { device_id: 'esp32-pot-01', ts: NOW, metrics: {} },
          { device_id: 'esp32-pot-01', ts: NOW, metrics: { temp_c: 'hot' } },
          null,
        ],
      })
      assert.deepEqual(await res.json(), { received: 5, stored: 1, duplicates: 0, rejected: 4 })
    })

    it('returns 400 for bad JSON or a body without readings, and 413 for oversized batches', async () => {
      assert.equal((await post(null, TOKEN, '{not json')).status, 400)
      assert.equal((await post({ nope: 1 })).status, 400)
      assert.equal((await post({ readings: Array.from({ length: 501 }, () => reading()) })).status, 413)
    })

    it('history returns one device, oldest first, within the time window', async () => {
      await post({
        readings: [
          reading({ ts: NOW - 3 * 3600, received_ts: NOW - 3 * 3600 }),
          reading({ ts: NOW - 600, received_ts: NOW - 600 }),
          reading({ ts: NOW - 30 * 3600, received_ts: NOW - 30 * 3600 }), // outside 24 h
          reading({ device_id: 'esp32-pot-02' }),
        ],
      })
      const h = await (await fetch(`${base}/api/readings?device_id=esp32-pot-01&hours=24`)).json()
      assert.equal(h.readings.length, 2)
      assert.ok(h.readings[0].ts < h.readings[1].ts)
      assert.equal((await fetch(`${base}/api/readings`)).status, 400)
    })

    it('read endpoints are open to browsers (CORS) but cannot be used to write', async () => {
      const res = await fetch(`${base}/api/devices`)
      assert.equal(res.headers.get('access-control-allow-origin'), '*')
      assert.equal((await fetch(`${base}/api/devices`, { method: 'POST', body: '{}' })).status, 404)
      assert.equal((await fetch(`${base}/healthz`)).status, 200)
    })
  })
}

describe('normalizeReading', () => {
  it('uses the Pi receive time when the ESP clock was not synced (ts 0)', () => {
    const r = normalizeReading(reading({ ts: 0 }), NOW)
    assert.equal(r.ts, (NOW - 55) * 1000)
  })
  it('ignores a device time far in the future', () => {
    const r = normalizeReading(reading({ ts: NOW + 10 * 86_400 }), NOW)
    assert.equal(r.ts, (NOW - 55) * 1000)
  })
  it('keeps only the contract metrics and finite numbers', () => {
    const r = normalizeReading(reading({ metrics: { temp_c: 21.5, evil: 1, rh_pct: NaN, co2_ppm: null } }), NOW)
    assert.deepEqual(r.metrics, { temp_c: 21.5 })
  })
})
