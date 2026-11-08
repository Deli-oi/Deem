import { AIR_QUALITY_SOLUTIONS } from './airQuality'
import type { Alert } from './alerts'
import type { PlantType } from './types'

/** The first sentence of a longer piece of advice. */
export function firstSentence(text: string): string {
  const t = text.trim()
  const m = t.match(/^(.+?[.!?])(\s|$)/)
  return m ? m[1] : t
}

/** Plain one-liners for out-of-range readings that have no stored fix in the plant data. */
const FALLBACK: Record<string, { low: string; high: string }> = {
  soil_ec: {
    low: 'The soil is low on nutrients, so feed it with diluted fertilizer.',
    high: 'There is too much fertilizer in the soil, so flush it with plain water.',
  },
  light_lux: {
    low: 'Move the plant somewhere brighter.',
    high: 'Move the plant out of harsh direct light.',
  },
}

const GENERIC = 'Check this reading and adjust the conditions.'

/**
 * One sentence telling the person what to do about an alert, taken from the plant's stored fix
 * (or the shared air-quality fixes), so it matches what the assistant would say.
 */
export function adviceFor(plant: PlantType, alert: Alert | undefined): string {
  if (!alert) return GENERIC
  const op = alert.direction === 'low' ? '<' : '>'
  const stored = [...plant.solutions, ...AIR_QUALITY_SOLUTIONS].find(
    (s) => s.trigger?.metric === alert.metric && s.trigger.op === op,
  )
  if (stored?.advice) return firstSentence(stored.advice)
  return FALLBACK[alert.metric]?.[alert.direction] ?? GENERIC
}
