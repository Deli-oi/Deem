import { withHealth } from '../lib/healthScore'
import { HourlyHealthStore } from '../lib/historyStore'
import { parseTelemetryMessage, sensorProgress, topics } from '../lib/telemetry'
import type { SensorProgress } from '../lib/telemetry'
import type { BackendEvent, DeemBackend } from '../lib/backendTypes'
import type { AskAnswer, HealthPoint, PlantMatch, PlantType, Telemetry } from '../lib/types'

/** How often the stored readings are fetched. The pot itself only reports every 30 s to 10 min. */
const POLL_MS = 30_000
const FETCH_TIMEOUT_MS = 8_000
/** How far back to look for the last complete reading. */
const HISTORY_HOURS = 6
const ALL_METRICS = ['co2_ppm', 'temp_c', 'rh_pct', 'pm1_0', 'pm2_5', 'pm4_0', 'pm10_0', 'soil_moisture', 'soil_temp_c'] as const
const isComplete = (t: Telemetry) => ALL_METRICS.every((k) => typeof (t.metrics as Record<string, unknown>)[k] === 'number')

type Options = {
  deviceId: string
  /** The ingest service URL (its public, read-only GET /api/readings). */
  base: string
  knowledge: Pick<DeemBackend, 'listPlants' | 'matchPlant' | 'ask'>
  fetchImpl?: typeof fetch
  pollMs?: number
  history?: HourlyHealthStore
}

/**
 * For the hosted page: shows the last COMPLETE reading stored in the cloud database (all nine metrics; a
 * newer one with a sensor missing is skipped), for people who are not next to the pot. It cannot reach
 * the Pi's MQTT broker, so it asks the ingest service instead.
 * Read-only: it never starts or stops data collection (only the Pi's screen does that), and it shows the
 * last stored reading even when collection is paused (the reading keeps its own timestamp).
 */
export class CloudBackend implements DeemBackend {
  private readonly deviceId: string
  private readonly base: string
  private readonly knowledge: Options['knowledge']
  private readonly fetchImpl: typeof fetch
  private readonly store: HourlyHealthStore

  private plant: PlantType | null = null
  private latest: Telemetry | null = null
  private lastLink: boolean | null = null
  private firstDone: Promise<void>
  private listeners = new Set<(e: BackendEvent) => void>()
  private timer: ReturnType<typeof setInterval>

  constructor(opts: Options) {
    this.deviceId = opts.deviceId
    this.base = opts.base.replace(/\/+$/, '')
    this.knowledge = opts.knowledge
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a))
    this.store = opts.history ?? new HourlyHealthStore()
    this.firstDone = this.poll()
    this.timer = setInterval(() => void this.poll(), opts.pollMs ?? POLL_MS)
  }

  private async poll(): Promise<void> {
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
      const url = `${this.base}/api/readings?device_id=${encodeURIComponent(this.deviceId)}&hours=${HISTORY_HOURS}&limit=2000`
      const res = await this.fetchImpl(url, { signal: ctl.signal }).finally(() => clearTimeout(t))
      if (!res.ok) throw new Error(`ingest ${res.status}`)
      const body = (await res.json()) as { readings?: Array<{ ts?: string; fw?: string; metrics?: unknown }> }
      // oldest first from the server: walk back from the newest to the last COMPLETE reading (all nine metrics,
      // after the same parsing and range checks as the live screen). If there is none, show the newest one.
      const rows = (body.readings ?? []).filter((r) => r.ts && r.metrics)
      if (rows.length === 0) throw new Error('no reading yet')
      const parse = (row: (typeof rows)[number]) =>
        parseTelemetryMessage(
          topics.telemetry(this.deviceId),
          JSON.stringify({ device_id: this.deviceId, ts: Math.floor(Date.parse(row.ts as string) / 1000), fw: row.fw, metrics: row.metrics }),
        )
      let raw: Telemetry | null = null
      for (let i = rows.length - 1; i >= 0 && !raw; i--) {
        try {
          const candidate = parse(rows[i])
          if (isComplete(candidate)) raw = candidate
        } catch {
          // skip a bad row
        }
      }
      raw ??= parse(rows[rows.length - 1])
      const telemetry = this.plant ? withHealth(raw, this.plant) : raw
      const isNew = !this.latest || this.latest.ts !== telemetry.ts
      this.latest = telemetry
      if (isNew) {
        if (telemetry.health_score != null) this.store.add(telemetry.ts, telemetry.health_score)
        this.emit({ type: 'telemetry', telemetry })
      }
      this.setLink(true)
    } catch {
      // keep showing the last reading we had; only say "offline" when there is nothing to show
      if (!this.latest) this.setLink(false)
    }
  }

  private setLink(online: boolean) {
    if (online === this.lastLink) return
    this.lastLink = online
    this.emit({ type: 'link', online })
  }

  private emit(event: BackendEvent) {
    for (const l of this.listeners) l(event)
  }

  subscribe(listener: (event: BackendEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  selectPlant(plant: PlantType): void {
    this.plant = plant
    if (this.latest) this.latest = withHealth(this.latest, plant)
  }

  async checkSensors(onProgress: (progress: SensorProgress[]) => void): Promise<SensorProgress[]> {
    await this.firstDone
    if (!this.latest) throw new Error(`No stored reading for ${this.deviceId}`)
    const progress = sensorProgress(this.latest.metrics, undefined, true)
    onProgress(progress)
    return progress
  }

  async getLatestTelemetry(plantTypeId: string): Promise<Telemetry> {
    void plantTypeId
    await this.firstDone
    if (!this.latest) throw new Error(`No stored reading for ${this.deviceId}`)
    return this.latest
  }

  async getHistory(plantTypeId: string): Promise<HealthPoint[]> {
    void plantTypeId
    return this.store.hours()
  }

  listPlants(): Promise<PlantType[]> {
    return this.knowledge.listPlants()
  }

  matchPlant(utterance: string): Promise<PlantMatch | null> {
    return this.knowledge.matchPlant(utterance)
  }

  ask(plantTypeId: string, question: string, telemetry?: Telemetry): Promise<AskAnswer> {
    return this.knowledge.ask(plantTypeId, question, telemetry ?? this.latest ?? undefined)
  }

  dispose() {
    clearInterval(this.timer)
  }
}
