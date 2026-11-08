import { describe, expect, it } from 'vitest'
import { metricRows, parseTelemetryMetrics } from './mqttContract'

describe('mqtt contract inputs', () => {
  it('keeps every v1 metric and drops non-numbers', () => {
    const metrics = parseTelemetryMetrics({
      co2_ppm: 812,
      temp_c: 22.4,
      rh_pct: 48.1,
      pm1_0: 3.2,
      pm2_5: 5.1,
      pm4_0: 6,
      pm10_0: 6.4,
      soil_moisture: 734,
      soil_temp_c: 21.8,
      ignored: 'nope',
    })
    expect(Object.keys(metrics)).toHaveLength(9)
    expect(metrics.soil_moisture).toBe(734)
  })

  it('accepts a partial device payload', () => {
    const metrics = parseTelemetryMetrics({ co2_ppm: 400, pm2_5: 4 })
    expect(metricRows(metrics).map((r) => r.key)).toEqual(['co2_ppm', 'pm2_5'])
  })

  it('keeps unknown numeric keys after the contract list', () => {
    const rows = metricRows(parseTelemetryMetrics({ temp_c: 20, leaf_mm: 12 }))
    expect(rows.map((r) => r.key)).toEqual(['temp_c', 'leaf_mm'])
  })
})
