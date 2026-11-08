import { randomUUID, timingSafeEqual } from 'node:crypto'
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
const PLANT_RE = /^[a-z0-9_]{1,64}$/

/** A session covers a reading only while the screen's heartbeat is this fresh (the screen beats every minute). */
export const SESSION_TTL_MS = 3 * 60_000
/** A reading that arrived with no session is handed to the next session if it is at most this old. */
const PENDING_MAX_AGE_MS = 15 * 60_000
const SESSION_RATE_LIMIT = 120 // per IP per minute

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
 *   POST /ingest                       Pi relay (Bearer token). Body {"readings":[...]}. Only readings that a
 *                                      session covers are stored; the rest are counted as no_session.
 *   POST /api/session/start            the screen: setup is finished. Body {device_id, plant_type_id}
 *   POST /api/session/heartbeat        the screen, every minute. Body {session_id}
 *   POST /api/session/stop             the screen's STOP button. Body {session_id}
 *   GET  /api/session?device_id=       is a session running? (public, read-only)
 *   GET  /api/devices                  latest reading per device (public, read-only)
 *   GET  /api/readings?device_id=&hours=24&limit=1000   history for one device (public, read-only)
 *   GET  /healthz
 */
export function createHandler({
  store,
  token,
  now = () => Date.now() / 1000,
  allowedOrigins = [],
  allowedDevices = ['esp32-pot-01'], // one pot for now
  newId = () => randomUUID(),
}) {
  const cors = { 'Access-Control-Allow-Origin': '*' }
  const origins = new Set(allowedOrigins)
  const corsFor = (origin) => (origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {})
  const hits = new Map()
  const limited = (ip) => {
    const t = now() * 1000
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < 60_000)
    recent.push(t)
    hits.set(ip, recent)
    return recent.length > SESSION_RATE_LIMIT
  }
  const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown'

  async function sessionRoutes(req, res, url) {
    const origin = req.headers.origin
    if (req.method === 'OPTIONS') {
      const c = corsFor(origin)
      if (!c['Access-Control-Allow-Origin']) return send(res, 403, { error: 'forbidden' })
      res.writeHead(204, { ...c, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' })
      return res.end()
    }
    // only our own pages (the Pi screen, the hosted page) may start or stop collection from a browser
    if (origin && !origins.has(origin)) return send(res, 403, { error: 'forbidden' })
    const c = corsFor(origin)
    if (limited(clientIp(req))) return send(res, 429, { error: 'rate_limited' }, c)
    const tMs = Math.round(now() * 1000)

    if (req.method === 'GET' && url.pathname === '/api/session') {
      const id = url.searchParams.get('device_id') ?? ''
      if (!DEVICE_RE.test(id)) return send(res, 400, { error: 'device_id required' }, { ...cors, ...c })
      const open = await store.openSession(id)
      const live = open !== null && tMs - new Date(open.last_seen).getTime() <= SESSION_TTL_MS
      return send(res, 200, { device_id: id, collecting: live, session: open }, { ...cors, ...c })
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, c)
    const body = await readJson(req)

    if (url.pathname === '/api/session/start') {
      const device = body?.device_id
      const plant = body?.plant_type_id
      if (typeof device !== 'string' || !allowedDevices.includes(device)) return send(res, 400, { error: 'unknown_device' }, c)
      if (typeof plant !== 'string' || !PLANT_RE.test(plant)) return send(res, 400, { error: 'bad_plant' }, c)
      const id = await store.startSession(device, plant, tMs, newId())
      // the newest reading that arrived before setup finished becomes the first stored one, so no 10-minute wait
      const pending = await store.takePending(device, tMs - PENDING_MAX_AGE_MS)
      const firstStored = pending ? (await store.insertMany([pending])) > 0 : false
      return send(res, 200, { session_id: id, ttl_ms: SESSION_TTL_MS, first_reading_stored: firstStored }, c)
    }
    if (url.pathname === '/api/session/heartbeat' || url.pathname === '/api/session/stop') {
      const id = body?.session_id
      if (typeof id !== 'string' || id.length === 0 || id.length > 64) return send(res, 400, { error: 'bad_session' }, c)
      if (url.pathname.endsWith('/heartbeat')) return send(res, 200, { active: await store.heartbeat(id, tMs) }, c)
      return send(res, 200, { stopped: await store.stopSession(id, tMs) }, c)
    }
    return send(res, 404, { error: 'not found' }, c)
  }

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x')
      if (url.pathname.startsWith('/api/session')) return await sessionRoutes(req, res, url)
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
        // Only readings a session covers are stored. The rest (setup not finished, screen gone) are dropped;
        // the newest per device is kept aside so the next session can start with it.
        const accepted = []
        const newestUncovered = new Map()
        for (const r of rows) {
          if (await store.sessionCovers(r.device_id, r.received_at, SESSION_TTL_MS)) accepted.push(r)
          else if (!newestUncovered.has(r.device_id) || newestUncovered.get(r.device_id).received_at < r.received_at) newestUncovered.set(r.device_id, r)
        }
        for (const r of newestUncovered.values()) await store.stashPending(r)
        const stored = await store.insertMany(accepted)
        // 200 even when some records were unusable or not wanted: retrying them would never help
        return send(res, 200, {
          received: list.length,
          stored,
          duplicates: accepted.length - stored,
          rejected: list.length - rows.length,
          no_session: rows.length - accepted.length,
        })
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
