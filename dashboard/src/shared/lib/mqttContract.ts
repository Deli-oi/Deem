// SYNCED FROM demo/src/lib/mqttContract.ts. Do not edit here: change it in demo/ and run `npm run sync`.
/**
 * Inputs the device must accept. Keep in sync with docs/mqtt_contract.md (v1).
 * `metrics` is open-ended: known keys are listed; unknown numeric keys still pass through.
 */
export const MQTT_CONTRACT_VERSION = 'v1'

export const CONTRACT_METRICS = [
  { key: 'co2_ppm', label: 'CO2', unit: 'ppm' },
  { key: 'temp_c', label: 'TEMP', unit: 'C' },
  { key: 'rh_pct', label: 'RH', unit: '%' },
  { key: 'pm1_0', label: 'PM1', unit: '' },
  { key: 'pm2_5', label: 'PM2.5', unit: '' },
  { key: 'pm4_0', label: 'PM4', unit: '' },
  { key: 'pm10_0', label: 'PM10', unit: '' },
  { key: 'soil_moisture', label: 'SOIL', unit: '' },
  { key: 'soil_temp_c', label: 'SOIL C', unit: 'C' },
] as const

export type ContractMetricKey = (typeof CONTRACT_METRICS)[number]['key']

export type MetricMap = Partial<Record<ContractMetricKey, number>> & Record<string, number>

const KNOWN = new Set<string>(CONTRACT_METRICS.map((m) => m.key))

export function parseTelemetryMetrics(raw: unknown): MetricMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('telemetry.metrics must be an object')
  }
  const metrics: MetricMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    metrics[key] = value
  }
  if (Object.keys(metrics).length === 0) {
    throw new Error('telemetry.metrics has no numeric readings')
  }
  return metrics
}

/** Stable display order: contract keys first, then any extra numeric keys. */
export function metricRows(metrics: MetricMap): Array<{ key: string; label: string; value: number; unit: string }> {
  const rows: Array<{ key: string; label: string; value: number; unit: string }> = []
  for (const spec of CONTRACT_METRICS) {
    const value = metrics[spec.key]
    if (typeof value === 'number') {
      rows.push({ key: spec.key, label: spec.label, value, unit: spec.unit })
    }
  }
  for (const [key, value] of Object.entries(metrics)) {
    if (KNOWN.has(key)) continue
    rows.push({ key, label: key, value, unit: '' })
  }
  return rows
}
