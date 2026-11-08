import { evaluateAlerts } from '../shared/lib/alerts'
import type { HealthPoint, Telemetry } from '../shared/lib/types'
import { plantHealth, statusFor } from '../lib/health'
import { hourKey } from './greenhouse'
import type { Greenhouse, PlantRecord } from './greenhouse'

/**
 * One pot is real. The ingest service (Pi relay -> Tiger database) hands us the readings of
 * the physical device, and this file puts them onto one plant of the simulated greenhouse.
 */
export type LiveReading = {
  device_id: string
  ts: string // ISO time
  fw?: string | null
  metrics: Record<string, number>
}

export type LiveConfig = {
  ingestUrl: string | null // base URL of the ingest service; null = simulation only
  deviceId: string
  plantId: string // which simulated plant the real pot stands in for
}

export function liveConfig(env: Record<string, string | undefined>): LiveConfig {
  const url = (env.VITE_INGEST_URL ?? '').trim().replace(/\/+$/, '')
  return {
    ingestUrl: url || null,
    deviceId: (env.VITE_LIVE_DEVICE_ID ?? 'esp32-pot-01').trim(),
    plantId: (env.VITE_LIVE_PLANT_ID ?? 'A-1-1').trim(),
  }
}

/** A reading older than this is shown as "offline" instead of being passed off as current. */
export const LIVE_STALE_MS = 25 * 60 * 1000 // two missed 10-minute samples plus slack

export function isFresh(r: LiveReading, nowMs: number): boolean {
  return nowMs - new Date(r.ts).getTime() <= LIVE_STALE_MS
}

/** Hourly average of the health score, same shape as the device's history chart. */
export function hourlyHealth(plant: PlantRecord, readings: LiveReading[]): HealthPoint[] {
  const byHour = new Map<string, number[]>()
  for (const r of readings) {
    const merged = { ...plant.metrics, ...r.metrics }
    const key = hourKey(new Date(r.ts).getTime() / 1000)
    const list = byHour.get(key) ?? []
    list.push(plantHealth(plant.type, merged))
    byHour.set(key, list)
  }
  return [...byHour.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([hour, v]) => ({ hour, avg_health: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }))
}

/**
 * Returns the greenhouse with the configured plant replaced by the real reading. Metrics the
 * real pot does not measure (soil minerals, ...) keep the simulated value so the popup stays complete.
 * A reading that is too old, or no reading, leaves the plant simulated.
 */
export function withLivePlant(
  g: Greenhouse,
  cfg: Pick<LiveConfig, 'plantId' | 'deviceId'>,
  latest: LiveReading | null,
  history: LiveReading[],
  nowMs: number,
): Greenhouse {
  if (!latest || !isFresh(latest, nowMs)) return g
  const i = g.plants.findIndex((p) => p.id === cfg.plantId)
  if (i === -1) return g
  const base = g.plants[i]
  const metrics = { ...base.metrics, ...latest.metrics }
  // the real pot has no biosphere controller, so nothing is auto-corrected: every out-of-range value alerts
  const alerts = evaluateAlerts(base.type, metrics, new Set<string>())
  const health = plantHealth(base.type, metrics)
  const shown = alerts.length > 0 ? Math.min(health, 64) : health
  const tsSec = Math.floor(new Date(latest.ts).getTime() / 1000)
  const telemetry: Telemetry = {
    device_id: latest.device_id,
    ts: tsSec,
    received_ts: tsSec,
    fw: latest.fw ?? 'live',
    metrics,
    health_score: shown,
  }
  const moist = base.soil.moisture
  const live: PlantRecord = {
    ...base,
    live: true,
    metrics,
    telemetry,
    alerts,
    health: shown,
    status: statusFor(health, alerts),
    soil: {
      ...base.soil,
      moisture: { ...moist, value: metrics.soil_moisture },
      temp: { ...base.soil.temp, value: metrics.soil_temp_c },
    },
    history: history.length > 0 ? hourlyHealth(base, history) : base.history,
  }
  const plants = g.plants.slice()
  plants[i] = live
  return { ...g, plants }
}

export async function fetchLatest(cfg: LiveConfig, signal?: AbortSignal): Promise<LiveReading | null> {
  if (!cfg.ingestUrl) return null
  const res = await fetch(`${cfg.ingestUrl}/api/devices`, { signal })
  if (!res.ok) throw new Error(`ingest ${res.status}`)
  const body = (await res.json()) as { devices?: LiveReading[] }
  return body.devices?.find((d) => d.device_id === cfg.deviceId) ?? null
}

export async function fetchHistory(cfg: LiveConfig, signal?: AbortSignal): Promise<LiveReading[]> {
  if (!cfg.ingestUrl) return []
  const res = await fetch(`${cfg.ingestUrl}/api/readings?device_id=${encodeURIComponent(cfg.deviceId)}&hours=24`, { signal })
  if (!res.ok) throw new Error(`ingest ${res.status}`)
  const body = (await res.json()) as { readings?: LiveReading[] }
  return body.readings ?? []
}
