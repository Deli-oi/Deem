import type { Metrics, PlantType } from './types'

/**
 * Alerts: a reading outside the plant's healthy range (the thresholds in the plant data)
 * needs fixing, so the device shows it and plays an alert sound.
 *
 * MVP: nothing corrects itself, so EVERY out-of-range reading alerts.
 *
 * Later (full-greenhouse dashboard): a biosphere controller fixes what it can (watering,
 * temperature, humidity), and the device only alerts for what it cannot change, e.g. soil
 * quality. To switch that on, list the metrics the controller handles in `AUTO_CORRECTED`
 * (or set VITE_AUTO_CORRECTED="soil_moisture,temp_c,rh_pct"). No other code changes.
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
  soil_moisture: { low: 'Soil too dry', high: 'Soil too wet' },
  temp_c: { low: 'Too cold', high: 'Too hot' },
  rh_pct: { low: 'Air too dry', high: 'Air too humid' },
  soil_ec: { low: 'Soil needs food', high: 'Too much fertilizer' },
  light_lux: { low: 'Too dark', high: 'Too bright' },
}

function labelFor(metric: string, direction: 'low' | 'high') {
  return LABELS[metric]?.[direction] ?? `${metric} ${direction}`
}

/** Out-of-range readings for this plant, most important first (soil, then temperature, then air). */
export function evaluateAlerts(
  plant: PlantType,
  metrics: Metrics,
  autoCorrected: ReadonlySet<string> = AUTO_CORRECTED,
): Alert[] {
  const alerts: Alert[] = []
  for (const [metric, range] of Object.entries(plant.thresholds) as Array<[string, { min: number | null; max: number | null } | undefined]>) {
    if (!range || autoCorrected.has(metric)) continue
    const value = (metrics as Record<string, number | undefined>)[metric]
    if (typeof value !== 'number') continue // the device does not report this one
    if (range.min != null && value < range.min) {
      alerts.push({ metric, direction: 'low', value, limit: range.min, label: labelFor(metric, 'low') })
    } else if (range.max != null && value > range.max) {
      alerts.push({ metric, direction: 'high', value, limit: range.max, label: labelFor(metric, 'high') })
    }
  }
  const order = ['soil_moisture', 'soil_ec', 'temp_c', 'rh_pct']
  return alerts.sort((a, b) => rank(order, a.metric) - rank(order, b.metric))
}

function rank(order: string[], metric: string) {
  const i = order.indexOf(metric)
  return i === -1 ? order.length : i
}
