import mqtt from 'mqtt'
import { withHealth } from '../lib/healthScore'
import { HourlyHealthStore } from '../lib/historyStore'
import { parseStatusMessage, parseTelemetryMessage, sensorProgress, topics } from '../lib/telemetry'
import type { DeviceStatus, SensorProgress } from '../lib/telemetry'
import type { BackendEvent, DeemBackend } from '../lib/backendTypes'
import type { AskAnswer, HealthPoint, PlantMatch, PlantType, Telemetry } from '../lib/types'

/**
 * How long setup waits for every sensor to come up. The device initializes a sensor in about a
 * second, but the air sensor needs a few seconds of warm-up before it gives valid readings, and
 * a late WiFi/MQTT connect adds more, so be patient before calling a sensor dead.
 */
const SENSOR_READY_TIMEOUT_MS = 60_000
/** How long to wait for a first reading (the device keeps its latest sample on the broker). */
const FIRST_TELEMETRY_TIMEOUT_MS = 30_000

/** The small slice of an MQTT client we use. Lets tests inject a fake. */
export interface MqttLink {
  onConnect(cb: () => void): void
  onDisconnect(cb: () => void): void
  onMessage(cb: (topic: string, payload: Uint8Array) => void): void
  subscribe(topicList: string[]): void
  end(): void
}

/** Browsers cannot open raw TCP, so this uses Mosquitto's WebSocket listener (pi/deploy/mosquitto.conf). */
export function connectWebSocket(url: string, clientId: string): MqttLink {
  const client = mqtt.connect(url, { clientId, reconnectPeriod: 2000, protocolVersion: 4 })
  return {
    onConnect: (cb) => client.on('connect', cb),
    onDisconnect: (cb) => {
      client.on('close', cb)
      client.on('offline', cb)
    },
    onMessage: (cb) => client.on('message', (topic, payload) => cb(topic, payload)),
    subscribe: (list) => client.subscribe(list, { qos: 1 }),
    end: () => client.end(true),
  }
}

type Options = {
  /** One ESP32 per pot: the device_id IS the pot (esp32-pot-01). */
  deviceId: string
  link: MqttLink
  /** Plant knowledge, matching and Q&A come from here until Atlas/Gemini are wired in. */
  knowledge: Pick<DeemBackend, 'listPlants' | 'matchPlant' | 'ask'>
  history?: HourlyHealthStore
}

/**
 * Reads the real ESP32 over MQTT. Read-only: the device sends readings and its status, and the
 * app never sends it commands (no sample-now, no pump). Thresholds live in the app, not on the
 * device, so the firmware only reports raw readings.
 */
export class MqttBackend implements DeemBackend {
  private readonly deviceId: string
  private readonly link: MqttLink
  private readonly knowledge: Options['knowledge']
  private readonly store: HourlyHealthStore

  private plant: PlantType | null = null
  private latest: Telemetry | null = null
  private sensorFlags: DeviceStatus['sensors']
  private connected = false
  /** Only the device's own status says whether it is up (a retained reading can be old). */
  private deviceOnline = false
  private lastLink: boolean | null = null
  private listeners = new Set<(e: BackendEvent) => void>()
  private watchers = new Set<() => void>()

  constructor(opts: Options) {
    this.deviceId = opts.deviceId
    this.link = opts.link
    this.knowledge = opts.knowledge
    this.store = opts.history ?? new HourlyHealthStore()

    this.link.onConnect(() => {
      this.connected = true
      this.link.subscribe([topics.telemetry(this.deviceId), topics.status(this.deviceId)])
      this.emitLink()
      this.notify()
    })
    this.link.onDisconnect(() => {
      this.connected = false
      this.emitLink()
      this.notify()
    })
    this.link.onMessage((topic, payload) => this.handle(topic, payload))
  }

  private handle(topic: string, payload: Uint8Array) {
    // Bad packets are dropped: one malformed message must never take the screen down.
    try {
      if (topic === topics.telemetry(this.deviceId)) {
        const raw = parseTelemetryMessage(topic, payload)
        const telemetry = this.plant ? withHealth(raw, this.plant) : raw
        this.latest = telemetry
        if (telemetry.health_score != null) this.store.add(telemetry.ts, telemetry.health_score)
        this.emit({ type: 'telemetry', telemetry })
      } else if (topic === topics.status(this.deviceId)) {
        const status = parseStatusMessage(topic, payload)
        this.deviceOnline = status.state === 'online'
        if (status.sensors) this.sensorFlags = status.sensors
        this.emitLink()
      }
      this.notify()
    } catch {
      // ignore
    }
  }

  private emit(event: BackendEvent) {
    for (const l of this.listeners) l(event)
  }

  private notify() {
    for (const w of [...this.watchers]) w()
  }

  private emitLink() {
    const online = this.connected && this.deviceOnline
    if (online === this.lastLink) return
    this.lastLink = online
    this.emit({ type: 'link', online })
  }

  subscribe(listener: (event: BackendEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  selectPlant(plant: PlantType): void {
    this.plant = plant
    if (this.latest) this.latest = withHealth(this.latest, plant)
  }

  private waitForTelemetry(timeoutMs: number): Promise<Telemetry> {
    if (this.latest) return Promise.resolve(this.latest)
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        off()
        reject(new Error(`No data from ${this.deviceId}`))
      }, timeoutMs)
      const off = this.subscribe((e) => {
        if (e.type !== 'telemetry') return
        window.clearTimeout(timer)
        off()
        resolve(e.telemetry)
      })
    })
  }

  /**
   * Waits for the device to be online, then for each sensor to be ready, reporting progress as
   * it happens. A sensor is ready when its readings arrive; it has failed if the device says its
   * begin() failed, or it still has not produced readings after SENSOR_READY_TIMEOUT_MS.
   * Rejects if the device never comes online.
   */
  checkSensors(onProgress: (progress: SensorProgress[]) => void): Promise<SensorProgress[]> {
    return new Promise((resolve, reject) => {
      let expired = false
      const evaluate = () => {
        if (!this.deviceOnline) {
          // Not up yet: every sensor is still pending (a stored reading may be from before a reboot).
          const waiting = sensorProgress(undefined, undefined, false)
          onProgress(waiting)
          if (expired) done(() => reject(new Error(`${this.deviceId} is offline`)))
          return
        }
        const progress = sensorProgress(this.latest?.metrics, this.sensorFlags, expired)
        onProgress(progress)
        if (progress.every((p) => p.state !== 'pending')) done(() => resolve(progress))
      }
      const timer = window.setTimeout(() => {
        expired = true
        evaluate()
      }, SENSOR_READY_TIMEOUT_MS)
      const done = (finish: () => void) => {
        window.clearTimeout(timer)
        this.watchers.delete(evaluate)
        finish()
      }
      this.watchers.add(evaluate)
      evaluate()
    })
  }

  async getLatestTelemetry(plantTypeId: string): Promise<Telemetry> {
    void plantTypeId
    return this.waitForTelemetry(FIRST_TELEMETRY_TIMEOUT_MS)
  }

  /** There is no sample-now: TEST shows the newest reading the device sent. */
  async collectNow(plantTypeId: string): Promise<Telemetry> {
    return this.getLatestTelemetry(plantTypeId)
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
    this.link.end()
  }
}
