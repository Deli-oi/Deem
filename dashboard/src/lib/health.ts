import type { Alert } from '../shared/lib/alerts'
import type { PlantType } from '../shared/lib/types'

/**
 * Greenhouse mode: a biosphere controller keeps these in range on its own, so they never raise
 * an alert here. Only what it cannot change (soil minerals, light) alerts. This is the
 * `AUTO_CORRECTED` idea from the device, switched on.
 */
export const AUTO_CORRECTED: ReadonlySet<string> = new Set([
  'soil_moisture',
  'temp_c',
  'rh_pct',
  'co2_ppm',
  'pm2_5',
  'pm10_0',
])

export type Status = 'great' | 'good' | 'watch' | 'alert'

/**
 * How comfortable a reading is for the plant: 100 at the middle of its healthy range, easing
 * smoothly to 76 at the edge, and dropping fast outside it.
 */
export function comfort(value: number, min: number | null | undefined, max: number | null | undefined): number {
  if (min == null || max == null || max <= min) return 100
  const center = (min + max) / 2
  const half = (max - min) / 2
  const d = Math.abs(value - center) / half
  if (d <= 1) return 100 - 24 * d ** 1.4
  return Math.max(0, 76 - (d - 1) * 110)
}

/** Air comfort: fine up to the usual limits, then falls off. */
function airComfort(m: Record<string, number>): number {
  let score = 100
  if (typeof m.co2_ppm === 'number' && m.co2_ppm > 1000) score -= Math.min(40, (m.co2_ppm - 1000) / 25)
  if (typeof m.pm2_5 === 'number' && m.pm2_5 > 12) score -= Math.min(30, (m.pm2_5 - 12) * 2)
  return score
}

/** Overall plant health 0-100 for the greenhouse views (soil moisture, minerals, climate, air). */
export function plantHealth(plant: PlantType, m: Record<string, number>): number {
  const t = plant.thresholds
  const parts: Array<[number, number]> = []
  if (typeof m.soil_moisture === 'number') parts.push([0.28, comfort(m.soil_moisture, t.soil_moisture.min, t.soil_moisture.max)])
  if (typeof m.soil_ec === 'number' && t.soil_ec) parts.push([0.22, comfort(m.soil_ec, t.soil_ec.min, t.soil_ec.max)])
  if (typeof m.temp_c === 'number') parts.push([0.2, comfort(m.temp_c, t.temp_c.min, t.temp_c.max)])
  if (typeof m.rh_pct === 'number') parts.push([0.15, comfort(m.rh_pct, t.rh_pct.min, t.rh_pct.max)])
  parts.push([0.15, airComfort(m)])
  const weight = parts.reduce((a, [w]) => a + w, 0)
  return Math.round(parts.reduce((a, [w, s]) => a + w * s, 0) / weight)
}

export function statusFor(score: number, alerts: Alert[]): Status {
  if (alerts.length > 0) return 'alert'
  if (score >= 92) return 'great'
  if (score >= 82) return 'good'
  return 'watch'
}

/** Colors used for health everywhere in the dashboard (readable on the light, cozy theme). */
export const STATUS_COLOR: Record<Status, string> = {
  great: '#3f8a2c',
  good: '#7a9a22',
  watch: '#d58a14',
  alert: '#d6455d',
}

export const STATUS_LABEL: Record<Status, string> = {
  great: 'Thriving',
  good: 'Doing well',
  watch: 'Keep an eye',
  alert: 'Needs you',
}
