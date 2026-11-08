// Storage for readings. PgStore talks to the Tiger database (Postgres). MemoryStore is for tests/dev.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS readings (
  device_id   text        NOT NULL,
  ts          timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  fw          text,
  metrics     jsonb       NOT NULL,
  label       text,
  PRIMARY KEY (device_id, ts)
);
-- label marks rows that must not be used (e.g. 'bad_test_data'); NULL = real data
ALTER TABLE readings ADD COLUMN IF NOT EXISTS label text;
CREATE INDEX IF NOT EXISTS readings_ts_idx ON readings (ts DESC);

-- A session = setup finished on the screen (plant confirmed, all sensors checked) and the screen still alive.
-- Readings are only stored while a session covers them.
CREATE TABLE IF NOT EXISTS sessions (
  id            text        PRIMARY KEY,
  device_id     text        NOT NULL,
  plant_type_id text        NOT NULL,
  started_at    timestamptz NOT NULL,
  last_seen     timestamptz NOT NULL,
  ended_at      timestamptz
);

-- The newest reading that arrived with no session: handed to the next session so its first row lands at once.
CREATE TABLE IF NOT EXISTS pending_readings (
  device_id   text        PRIMARY KEY,
  ts          timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  fw          text,
  metrics     jsonb       NOT NULL
);
`

const toRow = (r) => ({
  device_id: r.device_id,
  ts: new Date(r.ts).toISOString(),
  received_at: new Date(r.received_at).toISOString(),
  fw: r.fw ?? null,
  metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : r.metrics,
})

export class PgStore {
  constructor(pool) {
    this.pool = pool
  }
  async init() {
    await this.pool.query(SCHEMA)
  }
  /** Inserts readings; a reading already stored (same device and time) is skipped, so Pi retries are safe. */
  async insertMany(rows) {
    let inserted = 0
    for (const r of rows) {
      const res = await this.pool.query(
        `INSERT INTO readings (device_id, ts, received_at, fw, metrics)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (device_id, ts) DO NOTHING
         RETURNING 1`,
        [r.device_id, new Date(r.ts).toISOString(), new Date(r.received_at).toISOString(), r.fw ?? null, JSON.stringify(r.metrics)],
      )
      inserted += res.rows.length // RETURNING yields a row only when the insert happened
    }
    return inserted
  }
  async latest() {
    const res = await this.pool.query(
      `SELECT DISTINCT ON (device_id) device_id, ts, received_at, fw, metrics
       FROM readings WHERE label IS NULL ORDER BY device_id, ts DESC`,
    )
    return res.rows.map(toRow)
  }
  async history(deviceId, sinceIso, limit) {
    const res = await this.pool.query(
      `SELECT device_id, ts, received_at, fw, metrics FROM readings
       WHERE device_id = $1 AND ts >= $2 AND label IS NULL ORDER BY ts ASC LIMIT $3`,
      [deviceId, sinceIso, limit],
    )
    return res.rows.map(toRow)
  }
  /**
   * Was a session running when a reading arrived at `tMs`? True if one started before it and either had
   * ended after it, or is still open and its last heartbeat was within `ttlMs` of it.
   */
  async sessionCovers(deviceId, tMs, ttlMs) {
    const res = await this.pool.query(
      `SELECT 1 FROM sessions WHERE device_id = $1 AND started_at <= $2
       AND ((ended_at IS NULL AND last_seen >= $3) OR (ended_at IS NOT NULL AND ended_at >= $2)) LIMIT 1`,
      [deviceId, new Date(tMs).toISOString(), new Date(tMs - ttlMs).toISOString()],
    )
    return res.rows.length > 0
  }
  /** Ends any open session of this device and starts a new one. Returns its id. */
  async startSession(deviceId, plantTypeId, nowMs, id) {
    const now = new Date(nowMs).toISOString()
    await this.pool.query('UPDATE sessions SET ended_at = $2 WHERE device_id = $1 AND ended_at IS NULL', [deviceId, now])
    await this.pool.query('INSERT INTO sessions (id, device_id, plant_type_id, started_at, last_seen) VALUES ($1, $2, $3, $4, $4)', [id, deviceId, plantTypeId, now])
    return id
  }
  async heartbeat(id, nowMs) {
    const res = await this.pool.query('UPDATE sessions SET last_seen = $2 WHERE id = $1 AND ended_at IS NULL RETURNING 1', [id, new Date(nowMs).toISOString()])
    return res.rows.length > 0
  }
  async stopSession(id, nowMs) {
    const now = new Date(nowMs).toISOString()
    const res = await this.pool.query('UPDATE sessions SET ended_at = $2, last_seen = $2 WHERE id = $1 AND ended_at IS NULL RETURNING 1', [id, now])
    return res.rows.length > 0
  }
  /** The open session of a device, if any (for status; the id is not exposed). */
  async openSession(deviceId) {
    const res = await this.pool.query('SELECT plant_type_id, started_at, last_seen FROM sessions WHERE device_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1', [deviceId])
    const r = res.rows[0]
    return r ? { plant_type_id: r.plant_type_id, started_at: new Date(r.started_at).toISOString(), last_seen: new Date(r.last_seen).toISOString() } : null
  }
  async stashPending(row) {
    await this.pool.query('DELETE FROM pending_readings WHERE device_id = $1', [row.device_id])
    await this.pool.query(
      'INSERT INTO pending_readings (device_id, ts, received_at, fw, metrics) VALUES ($1, $2, $3, $4, $5)',
      [row.device_id, new Date(row.ts).toISOString(), new Date(row.received_at).toISOString(), row.fw ?? null, JSON.stringify(row.metrics)],
    )
  }
  /** Removes and returns the stashed reading if it arrived at or after `minReceivedMs`, else null. */
  async takePending(deviceId, minReceivedMs) {
    const res = await this.pool.query('SELECT device_id, ts, received_at, fw, metrics FROM pending_readings WHERE device_id = $1', [deviceId])
    await this.pool.query('DELETE FROM pending_readings WHERE device_id = $1', [deviceId])
    const r = res.rows[0]
    if (!r || new Date(r.received_at).getTime() < minReceivedMs) return null
    return { device_id: r.device_id, ts: new Date(r.ts).getTime(), received_at: new Date(r.received_at).getTime(), fw: r.fw, metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : r.metrics }
  }
  /** Marks readings older than `beforeIso` (optionally one device) with a label, so nothing reads them. Returns how many. */
  async labelBefore(beforeIso, label, deviceId = null) {
    const res = await this.pool.query(
      `UPDATE readings SET label = $1 WHERE label IS NULL AND ts < $2 AND ($3::text IS NULL OR device_id = $3) RETURNING 1`,
      [label, beforeIso, deviceId],
    )
    return res.rows.length
  }
  async countUnlabeledBefore(beforeIso, deviceId = null) {
    const res = await this.pool.query(
      `SELECT count(*)::int AS n FROM readings WHERE label IS NULL AND ts < $1 AND ($2::text IS NULL OR device_id = $2)`,
      [beforeIso, deviceId],
    )
    return res.rows[0].n
  }
  async close() {
    await this.pool.end()
  }
}

export class MemoryStore {
  constructor() {
    this.rows = new Map()
    this.sessions = []
    this.pending = new Map()
  }
  async init() {}
  async insertMany(rows) {
    let inserted = 0
    for (const r of rows) {
      const row = { ...toRow(r), label: r.label ?? null }
      const key = `${row.device_id}|${row.ts}`
      if (!this.rows.has(key)) {
        this.rows.set(key, row)
        inserted++
      }
    }
    return inserted
  }
  async latest() {
    const best = new Map()
    for (const r of this.rows.values()) {
      if (r.label) continue
      const cur = best.get(r.device_id)
      if (!cur || r.ts > cur.ts) best.set(r.device_id, r)
    }
    return [...best.values()].sort((a, b) => a.device_id.localeCompare(b.device_id))
  }
  async history(deviceId, sinceIso, limit) {
    return [...this.rows.values()]
      .filter((r) => r.device_id === deviceId && r.ts >= sinceIso && !r.label)
      .sort((a, b) => (a.ts < b.ts ? -1 : 1))
      .slice(0, limit)
  }
  async sessionCovers(deviceId, tMs, ttlMs) {
    return this.sessions.some(
      (s) => s.device_id === deviceId && s.started_at <= tMs && ((s.ended_at === null && s.last_seen >= tMs - ttlMs) || (s.ended_at !== null && s.ended_at >= tMs)),
    )
  }
  async startSession(deviceId, plantTypeId, nowMs, id) {
    for (const s of this.sessions) if (s.device_id === deviceId && s.ended_at === null) s.ended_at = nowMs
    this.sessions.push({ id, device_id: deviceId, plant_type_id: plantTypeId, started_at: nowMs, last_seen: nowMs, ended_at: null })
    return id
  }
  async heartbeat(id, nowMs) {
    const s = this.sessions.find((x) => x.id === id && x.ended_at === null)
    if (s) s.last_seen = nowMs
    return !!s
  }
  async stopSession(id, nowMs) {
    const s = this.sessions.find((x) => x.id === id && x.ended_at === null)
    if (s) {
      s.ended_at = nowMs
      s.last_seen = nowMs
    }
    return !!s
  }
  async openSession(deviceId) {
    const s = this.sessions.filter((x) => x.device_id === deviceId && x.ended_at === null).sort((a, b) => b.started_at - a.started_at)[0]
    return s ? { plant_type_id: s.plant_type_id, started_at: new Date(s.started_at).toISOString(), last_seen: new Date(s.last_seen).toISOString() } : null
  }
  async stashPending(row) {
    this.pending.set(row.device_id, { ...row })
  }
  async takePending(deviceId, minReceivedMs) {
    const r = this.pending.get(deviceId)
    this.pending.delete(deviceId)
    return r && r.received_at >= minReceivedMs ? r : null
  }
  async labelBefore(beforeIso, label, deviceId = null) {
    let n = 0
    for (const r of this.rows.values()) {
      if (!r.label && r.ts < beforeIso && (deviceId === null || r.device_id === deviceId)) {
        r.label = label
        n++
      }
    }
    return n
  }
  async countUnlabeledBefore(beforeIso, deviceId = null) {
    return [...this.rows.values()].filter((r) => !r.label && r.ts < beforeIso && (deviceId === null || r.device_id === deviceId)).length
  }
  async close() {}
}
