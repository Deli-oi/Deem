import mqtt from 'mqtt'
import { withHealth } from '../lib/healthScore'
import { DailyHealthStore } from '../lib/historyStore'
import {
  parseAckMessage,
  parseStatusMessage,
  parseTelemetryMessage,
  relayCommand,
  sensorChecks,
  topics,
} from '../lib/telemetry'
import type { CommandAck, SensorCheck } from '../lib/telemetry'
import type { BackendEvent, DeemBackend } from '../lib/backendTypes'
import type { AskAnswer, DailyHealth, PlantMatch, PlantType, Telemetry } from '../lib/types'

/** Relay channel wired to the water pump (contract: set_relay { channel }). */
export const PUMP_CHANNEL = 1
const ACK_TIMEOUT_MS = 5000
const FIRST_TELEMETRY_TIMEOUT_MS = 15000

/** The small slice of an MQTT client we use. Lets tests inject a fake. */
export interface MqttLink {
  onConnect(cb: () => void): void
  onDisconnect(cb: () => void): void
  onMessage(cb: (topic: string, payload: Uint8Array) => void): void
  subscribe(topicList: string[]): void
  publish(topic: string, payload: string): void
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
    publish: (topic, payload) => client.publish(topic, payload, { qos: 1 }),
    end: () => client.end(true),
  }
}

type Options = {
  /** One ESP32 per pot: the device_id IS the pot (esp32-pot-01). */
  deviceId: string
  link: MqttLink
  /** Plant knowledge, matching and Q&A come from here until Atlas/Gemini are wired in. */
  knowledge: Pick<DeemBackend, 'listPlants' | 'matchPlant' | 'ask'>
  history?: DailyHealthStore
}

export class MqttBackend implements DeemBackend {
  private readonly deviceId: string
  private readonly link: MqttLink
  private readonly knowledge: Options['knowledge']
  private readonly store: DailyHealthStore

  private plant: PlantType | null = null
  private latest: Telemetry | null = null
  private connected = false
  private deviceOnline = false
  private lastLink: boolean | null = null
  private listeners = new Set<(e: BackendEvent) => void>()
  private acks = new Map<string, (ack: CommandAck) => void>()
  private cmdCounter = 0

  constructor(opts: Options) {
    this.deviceId = opts.deviceId
    this.link = opts.link
    this.knowledge = opts.knowledge
    this.store = opts.history ?? new DailyHealthStore()

    this.link.onConnect(() => {
      this.connected = true
      this.link.subscribe([
        topics.telemetry(this.deviceId),
        topics.status(this.deviceId),
        topics.ack(this.deviceId),
      ])
      this.emitLink()
    })
    this.link.onDisconnect(() => {
      this.connected = false
      this.emitLink()
    })
    this.link.onMessage((topic, payload) => this.handle(topic, payload))
  }

  private handle(topic: string, payload: Uint8Array) {
    // Bad packets are dropped: one malformed message must never take the screen down.
    try {
      if (topic === topics.telemetry(this.deviceId)) {
        const raw = parseTelemetryMessage(topic, payload)
        this.deviceOnline = true
        const telemetry = this.plant ? withHealth(raw, this.plant) : raw
        this.latest = telemetry
        if (telemetry.health_score != null) this.store.add(telemetry.ts, telemetry.health_score)
        this.emit({ type: 'telemetry', telemetry })
        this.emitLink()
      } else if (topic === topics.status(this.deviceId)) {
        this.deviceOnline = parseStatusMessage(topic, payload).state === 'online'
        this.emitLink()
      } else if (topic === topics.ack(this.deviceId)) {
        const ack = parseAckMessage(payload)
        this.acks.get(ack.cmd_id)?.(ack)
      }
    } catch {
      // ignore
    }
  }

  private emit(event: BackendEvent) {
    for (const l of this.listeners) l(event)
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

  async checkSensors(): Promise<SensorCheck[]> {
    const t = await this.waitForTelemetry(FIRST_TELEMETRY_TIMEOUT_MS)
    return sensorChecks(t.metrics)
  }

  async getLatestTelemetry(plantTypeId: string): Promise<Telemetry> {
    void plantTypeId
    return this.waitForTelemetry(FIRST_TELEMETRY_TIMEOUT_MS)
  }

  /**
   * Collect-now is an ESP button (it publishes a fresh telemetry message itself).
   * There is no Pi->ESP "sample now" command in the v1 contract, so here we just
   * return the newest reading.
   */
  async collectNow(plantTypeId: string): Promise<Telemetry> {
    return this.getLatestTelemetry(plantTypeId)
  }

  async getHistory(plantTypeId: string): Promise<DailyHealth[]> {
    void plantTypeId
    return this.store.days()
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

  async setRelay(on: boolean): Promise<void> {
    if (!this.connected) throw new Error('Not connected to the broker')
    const cmdId = `ui-${Date.now()}-${++this.cmdCounter}`
    const ack = new Promise<CommandAck>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.acks.delete(cmdId)
        reject(new Error('No ack from device'))
      }, ACK_TIMEOUT_MS)
      this.acks.set(cmdId, (a) => {
        window.clearTimeout(timer)
        this.acks.delete(cmdId)
        resolve(a)
      })
    })
    this.link.publish(topics.cmd(this.deviceId), JSON.stringify(relayCommand(PUMP_CHANNEL, on, cmdId)))
    const result = await ack
    if (!result.ok) throw new Error(result.detail ?? 'Device refused the command')
  }

  dispose() {
    this.link.end()
  }
}
