import type { Metrics, PlantType, Telemetry } from './types'

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n))
}

function rangeScore(value: number, min: number | null | undefined, max: number | null | undefined) {
  if (min == null || max == null) return 100
  if (value >= min && value <= max) return 100
  if (value < min) {
    const span = Math.max(min, 1)
    return clamp(100 - ((min - value) / span) * 120)
  }
  const span = Math.max(max, 1)
  return clamp(100 - ((value - max) / span) * 120)
}

/** Rule-based placeholder health score for the MVP. */
export function scoreHealth(metrics: Metrics, plant: PlantType): number {
  const t = plant.thresholds
  const parts: number[] = []
  if (metrics.soil_moisture != null) {
    parts.push(rangeScore(metrics.soil_moisture, t.soil_moisture.min, t.soil_moisture.max) * 0.4)
  }
  if (metrics.temp_c != null) parts.push(rangeScore(metrics.temp_c, t.temp_c.min, t.temp_c.max) * 0.25)
  if (metrics.rh_pct != null) parts.push(rangeScore(metrics.rh_pct, t.rh_pct.min, t.rh_pct.max) * 0.2)

  let air = 100
  if (metrics.co2_ppm != null && metrics.co2_ppm > 1000) {
    air -= Math.min(35, (metrics.co2_ppm - 1000) / 30)
  }
  if (metrics.pm2_5 != null && metrics.pm2_5 > 12) air -= Math.min(20, (metrics.pm2_5 - 12) * 2)
  parts.push(air * 0.15)

  const weight = parts.reduce((a, b) => a + b, 0)
  return Math.round(clamp(weight))
}

export function withHealth(telemetry: Telemetry, plant: PlantType): Telemetry {
  return {
    ...telemetry,
    health_score: scoreHealth(telemetry.metrics, plant),
    received_ts: telemetry.received_ts ?? Date.now() / 1000,
  }
}

export function healthLabel(score: number): string {
  if (score >= 85) return 'Thriving'
  if (score >= 70) return 'Doing well'
  if (score >= 55) return 'Needs care'
  return 'Stressed'
}
