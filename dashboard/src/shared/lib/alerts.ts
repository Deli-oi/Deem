// SYNCED FROM demo/src/lib/alerts.ts. Do not edit here: change it in demo/ and run `npm run sync`.
import { AIR_QUALITY_LIMITS } from './airQuality'
import type { Metrics, PlantType } from './types'

/**
 * Every alert is CRITICAL. A plant's range (from the plant data) is the extremes it tolerates, and
 * the air-quality limits are set high, so a reading outside them is already hurting the plant (or
 * the room). Nothing alerts for a small drift. That is why every label says "critically".
 *
 * Alerts: a reading outside the plant's healthy range (the thresholds in the plant data), or
 * past the blanket air-quality limits (`airQuality.ts`: CO2 and dust), needs fixing, so the
 * device shows it and plays an alert sound.
 *
 * MVP: nothing corrects itself, so EVERY out-of-range reading alerts.
 *
 * Later (full-greenhouse dashboard): a biosphere controller fixes what it can (watering,
 * temperature, humidity, ventilation), and the device only alerts for what it cannot change,
 * e.g. soil quality. To switch that on, list the metrics the controller handles in
 * `AUTO_CORRECTED` (or set VITE_AUTO_CORRECTED="soil_moisture,temp_c,rh_pct,co2_ppm"). No
 * other code changes.
 */
export const AUTO_CORRECTED: ReadonlySet<string> = new Set(
  (import.meta.env.VITE_AUTO_CORRECTED ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean),
)

export type Alert = {
  metric: string
  direction: 'low' | 'high'
  value: number
  /** The healthy bound that was crossed. */
  limit: number
  /** Short, plain-language text for the screen. */
  label: string
}

const LABELS: Record<string, { low: string; high: string }> = {
  soil_moisture: { low: 'Soil critically dry', high: 'Soil critically wet' },
  temp_c: { low: 'Critically cold', high: 'Critically hot' },
  rh_pct: { low: 'Air critically dry', high: 'Air critically humid' },
  soil_ec: { low: 'Soil minerals critically low', high: 'Soil minerals critically high' },
  light_lux: { low: 'Light critically low', high: 'Light critically high' },
  co2_ppm: { low: 'CO2 critically low', high: 'CO2 critically high' },
  pm2_5: { low: 'Dust critically low', high: 'Fine dust critically high' },
  pm10_0: { low: 'Dust critically low', high: 'Dust critically high' },
}

function labelFor(metric: string, direction: 'low' | 'high') {
  return LABELS[metric]?.[direction] ?? `${metric} critically ${direction}`
}

/** Out-of-range readings for this plant, most important first (soil, then temperature, then air). */
export function evaluateAlerts(
  plant: PlantType,
  metrics: Metrics,
  autoCorrected: ReadonlySet<string> = AUTO_CORRECTED,
): Alert[] {
  const alerts: Alert[] = []
  // Blanket air-quality limits for every plant; a plant's own threshold for the same metric wins.
  const limits = { ...AIR_QUALITY_LIMITS, ...plant.thresholds } as Record<string, { min: number | null; max: number | null } | undefined>
  for (const [metric, range] of Object.entries(limits)) {
    if (!range || autoCorrected.has(metric)) continue
    const value = (metrics as Record<string, number | undefined>)[metric]
    if (typeof value !== 'number') continue // the device does not report this one
    if (range.min != null && value < range.min) {
      alerts.push({ metric, direction: 'low', value, limit: range.min, label: labelFor(metric, 'low') })
    } else if (range.max != null && value > range.max) {
      alerts.push({ metric, direction: 'high', value, limit: range.max, label: labelFor(metric, 'high') })
    }
  }
  const order = ['soil_moisture', 'soil_ec', 'temp_c', 'rh_pct', 'co2_ppm', 'pm2_5', 'pm10_0']
  return alerts.sort((a, b) => rank(order, a.metric) - rank(order, b.metric))
}

function rank(order: string[], metric: string) {
  const i = order.indexOf(metric)
  return i === -1 ? order.length : i
}
