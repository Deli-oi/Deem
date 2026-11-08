/**
 * Wire-format helpers for docs/mqtt_contract.md (v1). Pure functions, no I/O,
 * so the same code is unit-tested and used by the live MQTT backend.
 *
 * Topics:
 *   deem/<device_id>/telemetry  ESP32 -> Pi  (latest sample, retained)
 *   deem/<device_id>/status     ESP32 -> Pi  (retained; also the Last Will)
 *   deem/<device_id>/cmd, /cmd/ack exist in the contract but the MVP sends no commands.
 */
import { parseTelemetryMetrics } from './mqttContract'
import { sanitizeMetrics } from './sanity'
import type { MetricMap } from './mqttContract'
import type { Telemetry } from './types'

export const TOPIC_PREFIX = 'deem'

export const topics = {
  telemetry: (deviceId: string) => `${TOPIC_PREFIX}/${deviceId}/telemetry`,
  status: (deviceId: string) => `${TOPIC_PREFIX}/${deviceId}/status`,
}

/**
 * The contract says `soil_moisture` is "raw (0-1023) or %". The UI and the plant
 * thresholds (public/plants/*.json) work in percent, so convert raw readings here.
 * Anything 0-100 is treated as already a percent.
 *
 * ASSUMPTION TO CONFIRM WITH ZION: the Adafruit Stemma (seesaw) capacitive reading
 * is roughly 200 (dry, in air) to 2000 (wet). If the firmware sends % instead,
 * this is a no-op. Tune these two numbers against the real sensor.
 */
export const SOIL_RAW_DRY = 200
export const SOIL_RAW_WET = 2000

export function normalizeSoil(value: number): number {
  if (value <= 100) return value
  const pct = ((value - SOIL_RAW_DRY) / (SOIL_RAW_WET - SOIL_RAW_DRY)) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

function toText(payload: string | Uint8Array): string {
  return typeof payload === 'string' ? payload : new TextDecoder().decode(payload)
}

function parseObject(payload: string | Uint8Array): Record<string, unknown> {
  const value: unknown = JSON.parse(toText(payload))
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('payload must be a JSON object')
  }
  return value as Record<string, unknown>
}

/** device_id is the second topic segment: deem/<device_id>/<suffix...> */
export function deviceIdFromTopic(topic: string): string | null {
  const parts = topic.split('/')
  return parts[0] === TOPIC_PREFIX && parts.length >= 3 && parts[1] ? parts[1] : null
}

/**
 * Parse a telemetry message. Throws on anything that is not a valid v1 telemetry
 * message, so callers can drop bad packets without crashing the UI.
 *
 * - `device_id` falls back to the topic when omitted (contract: "recommended").
 * - `ts` may be 0 when the ESP32 has no clock; we then use arrival time.
 */
export function parseTelemetryMessage(
  topic: string,
  payload: string | Uint8Array,
  nowSeconds: number = Date.now() / 1000,
): Telemetry {
  if (!topic.endsWith('/telemetry')) throw new Error(`not a telemetry topic: ${topic}`)
  const body = parseObject(payload)
  const topicDevice = deviceIdFromTopic(topic)
  const device_id = topicDevice ?? (typeof body.device_id === 'string' ? body.device_id : null)
  if (!device_id) throw new Error('telemetry has no device_id')

  // impossible values (CO2 32767, dust 6553.5, a 57 C room) are dropped: they show as '--' and are never scored
  const parsed: MetricMap = parseTelemetryMetrics(body.metrics)
  if (typeof parsed.soil_moisture === 'number') {
    parsed.soil_moisture = normalizeSoil(parsed.soil_moisture) // raw counts become percent first, then the range check
  }
  const metrics: MetricMap = sanitizeMetrics(parsed).metrics

  const deviceTs = typeof body.ts === 'number' && body.ts > 0 ? body.ts : 0
  return {
    device_id,
    ts: deviceTs || Math.floor(nowSeconds),
    fw: typeof body.fw === 'string' ? body.fw : undefined,
    metrics,
    received_ts: nowSeconds,
  }
}

/** The three sensor groups, in the order the firmware initializes them (setup() in main.cpp). */
export type SensorId = 'dht' | 'air' | 'soil'

export type DeviceStatus = {
  device_id: string
  state: 'online' | 'offline'
  fw?: string
  /** Result of each sensor's begin() on the device, if it reports them (optional contract field). */
  sensors?: Partial<Record<SensorId, boolean>>
}

function parseSensorFlags(value: unknown): DeviceStatus['sensors'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Partial<Record<SensorId, boolean>> = {}
  for (const id of ['dht', 'air', 'soil'] as const) {
    const v = (value as Record<string, unknown>)[id]
    if (typeof v === 'boolean') out[id] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function parseStatusMessage(topic: string, payload: string | Uint8Array): DeviceStatus {
  const device_id = deviceIdFromTopic(topic)
  if (!device_id || !topic.endsWith('/status')) throw new Error(`not a status topic: ${topic}`)
  const body = parseObject(payload)
  if (body.state !== 'online' && body.state !== 'offline') throw new Error('status.state must be online|offline')
  return {
    device_id,
    state: body.state,
    fw: typeof body.fw === 'string' ? body.fw : undefined,
    sensors: parseSensorFlags(body.sensors),
  }
}

/**
 * The setup check rows, in the firmware's init order (main.cpp setup()): DHTSensor.begin() (DHT11,
 * pin 4), AirSens.begin() (SEN63C: reset, start, warm-up) and SoilSens.begin() (Stemma, 0x36).
 * `needs` are the metrics that prove the sensor is producing readings.
 */
export const SENSORS = [
  { id: 'dht', name: 'Temp/RH', needs: ['temp_c', 'rh_pct'] },
  { id: 'air', name: 'AQI', needs: ['co2_ppm'] },
  { id: 'soil', name: 'Soil', needs: ['soil_moisture'] },
] as const

export type SensorState = 'pending' | 'ok' | 'fail'

export type SensorProgress = { id: SensorId; name: string; state: SensorState }

/**
 * Where each sensor stands:
 *  - ok:      its readings are in the latest telemetry
 *  - fail:    its begin() failed on the device (status says so), or it never produced readings
 *             and we have stopped waiting (`expired`)
 *  - pending: still starting up
 */
export function sensorProgress(
  metrics: MetricMap | undefined,
  flags: DeviceStatus['sensors'] | undefined,
  expired: boolean,
): SensorProgress[] {
  return SENSORS.map((s) => {
    const producing = !!metrics && s.needs.every((k) => typeof metrics[k] === 'number')
    const state: SensorState = producing ? 'ok' : flags?.[s.id] === false || expired ? 'fail' : 'pending'
    return { id: s.id, name: s.name, state }
  })
}
