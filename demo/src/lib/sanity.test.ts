import { describe, expect, it } from 'vitest'
import { parseTelemetryMessage } from './telemetry'
import { sanitizeMetrics, VALID_RANGE } from './sanity'

describe('sanitizeMetrics', () => {
  it('keeps real readings untouched', () => {
    const m = { co2_ppm: 650, temp_c: 22.4, rh_pct: 45, pm2_5: 1.1, soil_moisture: 38, soil_temp_c: 27.8 }
    expect(sanitizeMetrics(m)).toEqual({ metrics: m, dropped: [] })
  })

  it('drops the sensor error markers seen on the real device', () => {
    const r = sanitizeMetrics({ co2_ppm: 32767, pm2_5: 6553.5, pm10_0: 6553.5, soil_moisture: 9 })
    expect(r.metrics).toEqual({ soil_moisture: 9 })
    expect(r.dropped.sort()).toEqual(['co2_ppm', 'pm10_0', 'pm2_5'])
    expect(sanitizeMetrics({ co2_ppm: 0 }).dropped).toEqual(['co2_ppm']) // 0 = not ready
    expect(sanitizeMetrics({ co2_ppm: 65535 }).dropped).toEqual(['co2_ppm'])
  })

  it('treats temperature and humidity as a pair: a 57 C reading throws out its 95 % too', () => {
    const r = sanitizeMetrics({ temp_c: 57.2, rh_pct: 95, co2_ppm: 700 })
    expect(r.metrics).toEqual({ co2_ppm: 700 })
    expect(r.dropped.sort()).toEqual(['rh_pct', 'temp_c'])
    expect(sanitizeMetrics({ temp_c: 22, rh_pct: 140 }).metrics).toEqual({})
  })

  it('drops NaN, Infinity and keeps keys it does not know about', () => {
    expect(sanitizeMetrics({ soil_moisture: NaN, soil_temp_c: Infinity, mystery: 12345 }).metrics).toEqual({ mystery: 12345 })
  })

  it('ranges cover every contract metric', () => {
    for (const k of ['co2_ppm', 'temp_c', 'rh_pct', 'pm1_0', 'pm2_5', 'pm4_0', 'pm10_0', 'soil_moisture', 'soil_temp_c']) expect(VALID_RANGE[k]).toBeTruthy()
  })
})

describe('the screen never shows or scores an impossible reading', () => {
  it('parses the real bad message from the device into clean metrics', () => {
    const payload = JSON.stringify({ device_id: 'esp32-pot-01', ts: 0, metrics: { co2_ppm: 32767, temp_c: 57.4, rh_pct: 95, pm2_5: 6553.5, soil_moisture: 9, soil_temp_c: 27.8 } })
    const t = parseTelemetryMessage('deem/esp32-pot-01/telemetry', payload, 1_800_000_000)
    expect(t.metrics).toEqual({ soil_moisture: 9, soil_temp_c: 27.8 })
  })
})
