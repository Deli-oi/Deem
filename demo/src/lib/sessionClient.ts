/**
 * Data collection = a session. When setup finishes on the screen (plant confirmed, every sensor checked)
 * the screen starts a session with the ingest service and keeps it alive with a heartbeat every minute.
 * The cloud only stores readings that arrive while a session is alive (heartbeat within 3 minutes), so
 * nothing is stored before setup, after the STOP button, or when the screen has gone away.
 *
 * The device never depends on this: if the cloud is unreachable the screen works as before, and the
 * client keeps retrying quietly on every heartbeat.
 */
export interface SessionService {
  /** Setup is finished: begin collecting data for this plant. */
  start(plantTypeId: string): void
  /** The STOP button: end collection (best effort) and stop the heartbeat. */
  stop(): Promise<void>
}

/** Mock mode, or no ingest URL configured: nothing to tell. */
export class NoopSession implements SessionService {
  start(): void {}
  async stop(): Promise<void> {}
}

type Options = {
  base: string // the ingest service URL
  deviceId: string
  fetchImpl?: typeof fetch
  heartbeatMs?: number
  timeoutMs?: number
}

export class SessionClient implements SessionService {
  private readonly base: string
  private readonly deviceId: string
  private readonly fetchImpl: typeof fetch
  private readonly heartbeatMs: number
  private readonly timeoutMs: number
  private plantTypeId: string | null = null
  private sessionId: string | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private starting = false

  constructor(opts: Options) {
    this.base = opts.base.replace(/\/+$/, '')
    this.deviceId = opts.deviceId
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a))
    this.heartbeatMs = opts.heartbeatMs ?? 60_000
    this.timeoutMs = opts.timeoutMs ?? 8000
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl.signal,
      })
      if (!res.ok) throw new Error(`ingest ${res.status}`)
      return (await res.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }

  start(plantTypeId: string): void {
    this.plantTypeId = plantTypeId
    this.sessionId = null
    if (this.timer) clearInterval(this.timer)
    void this.begin()
    this.timer = setInterval(() => void this.tick(), this.heartbeatMs)
  }

  private async begin(): Promise<void> {
    if (this.starting || !this.plantTypeId) return
    this.starting = true
    const plant = this.plantTypeId
    try {
      const out = await this.post<{ session_id: string }>('/api/session/start', { device_id: this.deviceId, plant_type_id: plant })
      // if STOP (or another start) happened while this was in flight, this answer is stale
      if (this.plantTypeId === plant && this.timer) this.sessionId = out.session_id
      else await this.post('/api/session/stop', { session_id: out.session_id }).catch(() => {})
    } catch {
      // unreachable: try again on the next heartbeat
    } finally {
      this.starting = false
    }
  }

  private async tick(): Promise<void> {
    if (!this.plantTypeId) return
    if (!this.sessionId) return this.begin()
    try {
      const { active } = await this.post<{ active: boolean }>('/api/session/heartbeat', { session_id: this.sessionId })
      if (!active) {
        // the session was ended behind our back (e.g. the cloud was restarted): the screen is still live, so start again
        this.sessionId = null
        await this.begin()
      }
    } catch {
      // unreachable: keep the id and try again next minute
    }
  }

  async stop(): Promise<void> {
    const id = this.sessionId
    this.plantTypeId = null
    this.sessionId = null
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (id) await this.post('/api/session/stop', { session_id: id }).catch(() => {})
  }
}
