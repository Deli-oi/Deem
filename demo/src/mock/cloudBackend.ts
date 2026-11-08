import { withHealth } from '../lib/healthScore'
import { HourlyHealthStore } from '../lib/historyStore'
import { parseTelemetryMessage, sensorProgress, topics } from '../lib/telemetry'
import type { SensorProgress } from '../lib/telemetry'
import type { BackendEvent, DeemBackend } from '../lib/backendTypes'
import type { AskAnswer, HealthPoint, PlantMatch, PlantType, Telemetry } from '../lib/types'

/** How often the newest stored reading is fetched. The pot itself only reports every 30 s to 10 min. */
const POLL_MS = 10_000
const FETCH_TIMEOUT_MS = 8_000

type Options = {
  deviceId: string
  /** The ingest service URL (its public, read-only GET /api/devices). */
  base: string
  knowledge: Pick<DeemBackend, 'listPlants' | 'matchPlant' | 'ask'>
  fetchImpl?: typeof fetch
  pollMs?: number
  history?: HourlyHealthStore
}

/**
 * For the hosted page: shows the newest reading stored in the cloud database, for people who are not
 * next to the pot. It cannot reach the Pi's MQTT broker, so it asks the ingest service instead.
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
      const res = await this.fetchImpl(`${this.base}/api/devices`, { signal: ctl.signal }).finally(() => clearTimeout(t))
      if (!res.ok) throw new Error(`ingest ${res.status}`)
      const body = (await res.json()) as { devices?: Array<{ device_id?: string; ts?: string; fw?: string; metrics?: unknown }> }
      const row = body.devices?.find((d) => d.device_id === this.deviceId)
      if (!row || !row.ts || !row.metrics) throw new Error('no reading yet')
      const sec = Math.floor(Date.parse(row.ts) / 1000)
      // same parsing and range checks as the live screen
      const raw = parseTelemetryMessage(
        topics.telemetry(this.deviceId),
        JSON.stringify({ device_id: this.deviceId, ts: sec, fw: row.fw, metrics: row.metrics }),
      )
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
