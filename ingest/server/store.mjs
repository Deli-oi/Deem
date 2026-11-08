// Storage for readings. PgStore talks to the Tiger database (Postgres). MemoryStore is for tests/dev.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS readings (
  device_id   text        NOT NULL,
  ts          timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  fw          text,
  metrics     jsonb       NOT NULL,
  PRIMARY KEY (device_id, ts)
);
CREATE INDEX IF NOT EXISTS readings_ts_idx ON readings (ts DESC);
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
       FROM readings ORDER BY device_id, ts DESC`,
    )
    return res.rows.map(toRow)
  }
  async history(deviceId, sinceIso, limit) {
    const res = await this.pool.query(
      `SELECT device_id, ts, received_at, fw, metrics FROM readings
       WHERE device_id = $1 AND ts >= $2 ORDER BY ts ASC LIMIT $3`,
      [deviceId, sinceIso, limit],
    )
    return res.rows.map(toRow)
  }
  async close() {
    await this.pool.end()
  }
}

export class MemoryStore {
  constructor() {
    this.rows = new Map()
  }
  async init() {}
  async insertMany(rows) {
    let inserted = 0
    for (const r of rows) {
      const row = toRow(r)
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
      const cur = best.get(r.device_id)
      if (!cur || r.ts > cur.ts) best.set(r.device_id, r)
    }
    return [...best.values()].sort((a, b) => a.device_id.localeCompare(b.device_id))
  }
  async history(deviceId, sinceIso, limit) {
    return [...this.rows.values()]
      .filter((r) => r.device_id === deviceId && r.ts >= sinceIso)
      .sort((a, b) => (a.ts < b.ts ? -1 : 1))
      .slice(0, limit)
  }
  async close() {}
}
