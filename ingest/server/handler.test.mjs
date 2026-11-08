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
      // readings are only stored while a session covers them: these tests run inside one (for both pots)
      for (const dev of ['esp32-pot-01', 'esp32-pot-02']) {
        await store.startSession(dev, 'dracaena', (NOW - 86_400) * 1000, `s-${dev}`)
        await store.heartbeat(`s-${dev}`, NOW * 1000)
      }
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
      assert.deepEqual(await res.json(), { received: 2, stored: 2, duplicates: 0, rejected: 0, no_session: 0 })
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
      if (name === 'MemoryStore') assert.deepEqual(again, { received: 1, stored: 0, duplicates: 1, rejected: 0, no_session: 0 })
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
      assert.deepEqual(await res.json(), { received: 5, stored: 1, duplicates: 0, rejected: 4, no_session: 0 })
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

    it('never stores impossible values (sensor error markers, a mis-wired DHT11)', async () => {
      const res = await post({
        readings: [
          reading({ metrics: { co2_ppm: 32767, pm2_5: 6553.5, temp_c: 57.4, rh_pct: 95, soil_moisture: 9, soil_temp_c: 27.8 } }),
          reading({ ts: NOW - 5, metrics: { co2_ppm: 32767, temp_c: 57.4, rh_pct: 95 } }), // nothing real left: rejected
        ],
      })
      assert.deepEqual(await res.json(), { received: 2, stored: 1, duplicates: 0, rejected: 1, no_session: 0 })
      const dev = await (await fetch(`${base}/api/devices`)).json()
      assert.deepEqual(dev.devices[0].metrics, { soil_moisture: 9, soil_temp_c: 27.8 })
    })

    it('cleans impossible values out of rows stored before the rule existed', async () => {
      await store.insertMany([
        { device_id: 'esp32-pot-01', ts: (NOW - 60) * 1000, received_at: (NOW - 60) * 1000, fw: 'old', metrics: { co2_ppm: 32767, pm2_5: 6553.5, temp_c: 57.4, rh_pct: 95, soil_moisture: 9 } },
      ])
      const dev = await (await fetch(`${base}/api/devices`)).json()
      assert.deepEqual(dev.devices[0].metrics, { soil_moisture: 9 })
      const hist = await (await fetch(`${base}/api/readings?device_id=esp32-pot-01`)).json()
      assert.deepEqual(hist.readings[0].metrics, { soil_moisture: 9 })
    })

    it('labelled test data is kept but never served, and only older rows get labelled', async () => {
      await post({ readings: [reading({ ts: NOW - 3000 }), reading({ ts: NOW - 2000 }), reading({ ts: NOW - 100 })] })
      const cutoff = new Date((NOW - 1000) * 1000).toISOString()
      assert.equal(await store.countUnlabeledBefore(cutoff), 2)
      assert.equal(await store.labelBefore(cutoff, 'bad_test_data'), 2)
      assert.equal(await store.labelBefore(cutoff, 'bad_test_data'), 0) // already labelled: nothing to do twice
      const hist = await (await fetch(`${base}/api/readings?device_id=esp32-pot-01`)).json()
      assert.equal(hist.readings.length, 1)
      assert.equal(new Date(hist.readings[0].ts).getTime(), (NOW - 100) * 1000)
      const dev = await (await fetch(`${base}/api/devices`)).json()
      assert.equal(new Date(dev.devices[0].ts).getTime(), (NOW - 100) * 1000)
      // everything old is labelled: with only labelled rows left, no device is reported
      await store.labelBefore(new Date(NOW * 1000).toISOString(), 'bad_test_data')
      assert.deepEqual((await (await fetch(`${base}/api/devices`)).json()).devices, [])
    })

    it('labelling can be limited to one device', async () => {
      await post({ readings: [reading({ ts: NOW - 500 }), reading({ device_id: 'esp32-pot-02', ts: NOW - 500 })] })
      const cutoff = new Date(NOW * 1000).toISOString()
      assert.equal(await store.labelBefore(cutoff, 'bad_test_data', 'esp32-pot-02'), 1)
      const dev = await (await fetch(`${base}/api/devices`)).json()
      assert.deepEqual(dev.devices.map((d) => d.device_id), ['esp32-pot-01'])
    })

    it('read endpoints are open to browsers (CORS) but cannot be used to write', async () => {
      const res = await fetch(`${base}/api/devices`)
      assert.equal(res.headers.get('access-control-allow-origin'), '*')
      assert.equal((await fetch(`${base}/api/devices`, { method: 'POST', body: '{}' })).status, 404)
      assert.equal((await fetch(`${base}/healthz`)).status, 200)
    })
  })
}

// Data collection only starts when setup is finished on the screen (a session) and stops when the screen stops.
for (const [name, makeStore] of [['MemoryStore', () => new MemoryStore()], ['PgStore (SQL)', pgStore]]) {
  describe(`sessions gate what is stored (${name})`, () => {
    const PI = 'http://localhost:3000'
    let server, base, store, clock
    beforeEach(async () => {
      store = makeStore()
      await store.init()
      clock = NOW
      let n = 0
      server = createServer(createHandler({ store, token: TOKEN, now: () => clock, allowedOrigins: [PI], newId: () => `sess-${++n}` }))
      await new Promise((r) => server.listen(0, '127.0.0.1', r))
      base = `http://127.0.0.1:${server.address().port}`
    })
    afterEach(async () => {
      await new Promise((r) => server.close(r))
    })

    const ingest = (readings) =>
      fetch(`${base}/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ readings }) }).then((r) => r.json())
    const session = (path, body, headers = {}) =>
      fetch(`${base}/api/session${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const start = async () => (await (await session('/start', { device_id: 'esp32-pot-01', plant_type_id: 'dracaena' }, { Origin: PI })).json()).session_id
    const stored = async () => (await (await fetch(`${base}/api/readings?device_id=esp32-pot-01&hours=48`)).json()).readings.length
    const at = (secondsAgo) => reading({ ts: clock - secondsAgo, received_ts: clock - secondsAgo })

    it('stores nothing before setup is finished', async () => {
      const out = await ingest([at(60), at(30)])
      assert.equal(out.stored, 0)
      assert.equal(out.no_session, 2)
      assert.equal(await stored(), 0)
      assert.deepEqual((await (await fetch(`${base}/api/devices`)).json()).devices, [])
    })

    it('starts storing when setup finishes, and the newest earlier reading becomes the first row', async () => {
      await ingest([at(400), at(120)]) // arrived before setup was done
      const res = await (await session('/start', { device_id: 'esp32-pot-01', plant_type_id: 'dracaena' }, { Origin: PI })).json()
      assert.equal(res.first_reading_stored, true)
      assert.equal(res.ttl_ms, 180000)
      assert.equal(await stored(), 1) // only the newest one, not both
      clock += 30 // a reading that arrives after the session started
      const out = await ingest([at(5)])
      assert.equal(out.stored, 1)
      assert.equal(await stored(), 2)
    })

    it('a reading older than 15 minutes is not promoted into the new session', async () => {
      await ingest([at(20 * 60)])
      const res = await (await session('/start', { device_id: 'esp32-pot-01', plant_type_id: 'dracaena' })).json()
      assert.equal(res.first_reading_stored, false)
      assert.equal(await stored(), 0)
    })

    it('keeps storing while the screen sends heartbeats, and stops when they stop for more than 3 minutes', async () => {
      const id = await start()
      clock += 60
      assert.equal((await (await session('/heartbeat', { session_id: id })).json()).active, true)
      assert.equal((await ingest([at(2)])).stored, 1)
      clock += 170 // 2 min 50 s after the last heartbeat: still covered
      assert.equal((await ingest([at(1)])).stored, 1)
      clock += 600 // the screen went away (reboot, page closed)
      const late = await ingest([at(1)])
      assert.equal(late.stored, 0)
      assert.equal(late.no_session, 1)
      assert.equal((await (await fetch(`${base}/api/session?device_id=esp32-pot-01`)).json()).collecting, false)
    })

    it('STOP ends collection: later readings are dropped, earlier ones were kept', async () => {
      const id = await start()
      clock += 30
      assert.equal((await ingest([at(5)])).stored, 1)
      clock += 30
      assert.equal((await (await session('/stop', { session_id: id })).json()).stopped, true)
      clock += 30
      assert.equal((await ingest([at(2)])).no_session, 1)
      assert.equal(await stored(), 1)
      assert.equal((await (await session('/heartbeat', { session_id: id })).json()).active, false) // the screen learns it is over
      assert.equal((await (await session('/stop', { session_id: id })).json()).stopped, false) // twice is harmless
    })

    it('a replayed reading is judged by when it arrived, not when it was replayed', async () => {
      const id = await start()
      clock += 20
      await session('/stop', { session_id: id })
      clock += 5000
      const out = await ingest([reading({ ts: NOW + 10, received_ts: NOW + 10 })]) // arrived during the session, replayed later
      assert.equal(out.stored, 1)
      const out2 = await ingest([reading({ ts: NOW + 4000, received_ts: NOW + 4000 })]) // arrived after STOP
      assert.equal(out2.no_session, 1)
    })

    it('starting again ends the previous session, and starting is for the known pot with a real plant id only', async () => {
      const first = await start()
      const second = await start()
      assert.notEqual(first, second)
      assert.equal((await (await session('/heartbeat', { session_id: first })).json()).active, false)
      assert.equal((await (await session('/heartbeat', { session_id: second })).json()).active, true)
      assert.equal((await session('/start', { device_id: 'esp32-pot-07', plant_type_id: 'dracaena' })).status, 400)
      assert.equal((await session('/start', { device_id: 'esp32-pot-01', plant_type_id: 'Dr acaena!' })).status, 400)
      assert.equal((await session('/heartbeat', { session_id: '' })).status, 400)
    })

    it('only our own pages may start or stop collection from a browser; preflight works for the listed one', async () => {
      assert.equal((await session('/start', { device_id: 'esp32-pot-01', plant_type_id: 'dracaena' }, { Origin: 'https://evil.example' })).status, 403)
      const ok = await session('/start', { device_id: 'esp32-pot-01', plant_type_id: 'dracaena' }, { Origin: PI })
      assert.equal(ok.status, 200)
      assert.equal(ok.headers.get('access-control-allow-origin'), PI)
      const pre = await fetch(`${base}/api/session/start`, { method: 'OPTIONS', headers: { Origin: PI, 'Access-Control-Request-Method': 'POST' } })
      assert.equal(pre.status, 204)
      assert.equal((await fetch(`${base}/api/session/start`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).status, 403)
    })

    it('reports whether collection is running', async () => {
      assert.equal((await (await fetch(`${base}/api/session?device_id=esp32-pot-01`)).json()).collecting, false)
      await start()
      const st = await (await fetch(`${base}/api/session?device_id=esp32-pot-01`)).json()
      assert.equal(st.collecting, true)
      assert.equal(st.session.plant_type_id, 'dracaena')
      assert.equal('id' in st.session, false) // the session id is a secret of the screen
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
