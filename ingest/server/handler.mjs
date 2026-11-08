import { timingSafeEqual } from 'node:crypto'
import { sanitizeMetrics } from './sanity.mjs'

// The metric keys of the MQTT contract (docs/mqtt_contract.md, v1). Anything else is ignored.
export const METRIC_KEYS = [
  'co2_ppm', 'temp_c', 'rh_pct',
  'pm1_0', 'pm2_5', 'pm4_0', 'pm10_0',
  'soil_moisture', 'soil_temp_c',
]
const MAX_BODY = 1_000_000
const MAX_BATCH = 500
const MIN_EPOCH = 1_700_000_000 // anything earlier means the device clock was not synced
const DEVICE_RE = /^[A-Za-z0-9_-]{1,64}$/

/** Turns one relayed record into a row to store, or returns null if it is not a usable reading. */
export function normalizeReading(rec, nowSec) {
  if (!rec || typeof rec !== 'object') return null
  if (typeof rec.device_id !== 'string' || !DEVICE_RE.test(rec.device_id)) return null
  if (!rec.metrics || typeof rec.metrics !== 'object' || Array.isArray(rec.metrics)) return null
  const metrics = {}
  for (const k of METRIC_KEYS) {
    const v = rec.metrics[k]
    if (typeof v === 'number' && Number.isFinite(v)) metrics[k] = v
  }
  // impossible values (sensor error markers, a mis-wired DHT11) never become data
  const clean = sanitizeMetrics(metrics).metrics
  if (Object.keys(clean).length === 0) return null
  const received = Number(rec.received_ts) > MIN_EPOCH ? Number(rec.received_ts) : nowSec
  const deviceTs = Number(rec.ts)
  // use the device's own time when its clock was synced, otherwise when the Pi received it
  const ts = deviceTs > MIN_EPOCH && deviceTs < nowSec + 86_400 ? deviceTs : received
  return {
    device_id: rec.device_id,
    ts: Math.round(ts * 1000),
    received_at: Math.round(received * 1000),
    fw: typeof rec.fw === 'string' ? rec.fw.slice(0, 32) : null,
    metrics: clean,
  }
}

/** Rows stored before the rule existed may hold impossible values: never hand those out. */
const cleanRow = (row) => ({ ...row, metrics: sanitizeMetrics(row.metrics ?? {}).metrics })

function tokenOk(header, token) {
  if (!token || typeof header !== 'string') return false
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 })
    chunks.push(c)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 })
  }
}

function send(res, status, body, extra = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra })
  res.end(payload)
}

/**
 * Routes:
 *   POST /ingest                       Pi relay (Bearer token). Body {"readings":[...]}.
 *   GET  /api/devices                  latest reading per device (public, read-only)
 *   GET  /api/readings?device_id=&hours=24&limit=1000   history for one device (public, read-only)
 *   GET  /healthz
 */
export function createHandler({ store, token, now = () => Date.now() / 1000 }) {
  const cors = { 'Access-Control-Allow-Origin': '*' }
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x')
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
        return res.end()
      }
      if (url.pathname === '/healthz') {
        await store.latest()
        return send(res, 200, { ok: true })
      }
      if (url.pathname === '/ingest') {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        if (!token) return send(res, 503, { error: 'ingest is disabled: DEEM_SINK_TOKEN is not set' })
        if (!tokenOk(req.headers.authorization, token)) return send(res, 401, { error: 'unauthorized' })
        const body = await readJson(req)
        const list = Array.isArray(body?.readings) ? body.readings : null
        if (!list) return send(res, 400, { error: 'body must be {"readings":[...]}' })
        if (list.length > MAX_BATCH) return send(res, 413, { error: `at most ${MAX_BATCH} readings per request` })
        const t = now()
        const rows = list.map((r) => normalizeReading(r, t)).filter(Boolean)
        const stored = await store.insertMany(rows)
        // 200 even when some records were unusable: retrying them would never help
        return send(res, 200, { received: list.length, stored, duplicates: rows.length - stored, rejected: list.length - rows.length })
      }
      if (req.method === 'GET' && url.pathname === '/api/devices') {
        return send(res, 200, { devices: (await store.latest()).map(cleanRow) }, cors)
      }
      if (req.method === 'GET' && url.pathname === '/api/readings') {
        const id = url.searchParams.get('device_id') ?? ''
        if (!DEVICE_RE.test(id)) return send(res, 400, { error: 'device_id required' }, cors)
        const hours = Math.min(Math.max(Number(url.searchParams.get('hours')) || 24, 1), 24 * 14)
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 1000, 1), 5000)
        const since = new Date((now() - hours * 3600) * 1000).toISOString()
        return send(res, 200, { device_id: id, readings: (await store.history(id, since, limit)).map(cleanRow) }, cors)
      }
      return send(res, 404, { error: 'not found' })
    } catch (e) {
      const status = e.status ?? 500
      if (status === 500) console.error('ingest error:', e)
      return send(res, status, { error: status === 500 ? 'server error' : e.message })
    }
  }
}
