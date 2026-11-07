/**
 * Wire-format helpers for docs/mqtt_contract.md (v1). Pure functions, no I/O,
 * so the same code is unit-tested and used by the live MQTT backend.
 *
 * Topics:
 *   deem/<device_id>/telemetry  ESP32 -> Pi  (QoS 1)
 *   deem/<device_id>/status     ESP32 -> Pi  (QoS 1, retained; also the Last Will)
 *   deem/<device_id>/cmd        Pi -> ESP32  (QoS 1)
 *   deem/<device_id>/cmd/ack    ESP32 -> Pi  (QoS 1)
 */
import { parseTelemetryMetrics } from './mqttContract'
import type { MetricMap } from './mqttContract'
import type { Telemetry } from './types'

export const TOPIC_PREFIX = 'deem'

export const topics = {
  telemetry: (deviceId: string) => `${TOPIC_PREFIX}/${deviceId}/telemetry`,
  status: (deviceId: string) => `${TOPIC_PREFIX}/${deviceId}/status`,
  cmd: (deviceId: string) => `${TOPIC_PREFIX}/${deviceId}/cmd`,
  ack: (deviceId: string) => `${TOPIC_PREFIX}/${deviceId}/cmd/ack`,
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

  const metrics: MetricMap = parseTelemetryMetrics(body.metrics)
  if (typeof metrics.soil_moisture === 'number') {
    metrics.soil_moisture = normalizeSoil(metrics.soil_moisture)
  }

  const deviceTs = typeof body.ts === 'number' && body.ts > 0 ? body.ts : 0
  return {
    device_id,
    ts: deviceTs || Math.floor(nowSeconds),
    fw: typeof body.fw === 'string' ? body.fw : undefined,
    metrics,
    received_ts: nowSeconds,
  }
}

export type DeviceStatus = { device_id: string; state: 'online' | 'offline'; fw?: string }

export function parseStatusMessage(topic: string, payload: string | Uint8Array): DeviceStatus {
  const device_id = deviceIdFromTopic(topic)
  if (!device_id || !topic.endsWith('/status')) throw new Error(`not a status topic: ${topic}`)
  const body = parseObject(payload)
  if (body.state !== 'online' && body.state !== 'offline') throw new Error('status.state must be online|offline')
  return { device_id, state: body.state, fw: typeof body.fw === 'string' ? body.fw : undefined }
}

export type CommandAck = { cmd_id: string; ok: boolean; detail?: string }

export function parseAckMessage(payload: string | Uint8Array): CommandAck {
  const body = parseObject(payload)
  if (typeof body.cmd_id !== 'string' || typeof body.ok !== 'boolean') throw new Error('bad ack')
  return { cmd_id: body.cmd_id, ok: body.ok, detail: typeof body.detail === 'string' ? body.detail : undefined }
}

export type CommandAction = 'set_relay' | 'set_interval' | 'identify' | 'reboot' | 'sample_now'

export type Command = {
  cmd_id: string
  ts: number
  action: CommandAction
  params: Record<string, unknown>
}

export function buildCommand(
  action: CommandAction,
  params: Record<string, unknown>,
  cmdId: string,
  nowSeconds: number = Date.now() / 1000,
): Command {
  return { cmd_id: cmdId, ts: Math.floor(nowSeconds), action, params }
}

export const relayCommand = (channel: number, on: boolean, cmdId: string, now?: number) =>
  buildCommand('set_relay', { channel, state: on ? 'on' : 'off' }, cmdId, now)

/** What each setup-check row needs to see in the telemetry `metrics`. */
export const SENSOR_CHECKS = [
  { name: 'Soil', needs: ['soil_moisture'] },
  { name: 'AQI', needs: ['co2_ppm'] },
  { name: 'Temp/RH', needs: ['temp_c', 'rh_pct'] },
] as const

export type SensorCheck = { name: string; ok: boolean }

export function sensorChecks(metrics: MetricMap): SensorCheck[] {
  return SENSOR_CHECKS.map((c) => ({ name: c.name, ok: c.needs.every((k) => typeof metrics[k] === 'number') }))
}
