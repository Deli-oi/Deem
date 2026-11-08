import { describe, expect, it } from 'vitest'
import { evaluateAlerts } from './alerts'
import { parseAckMessage, parseStatusMessage, parseTelemetryMessage, sensorChecks, topics } from './telemetry'
import type { PlantType } from './types'

/**
 * Zion's firmware (hackathon2026/) builds its messages with these exact formats
 * (sample_to_json in sample.h, mqtt_link.h). These tests feed byte-for-byte copies of them
 * through the app's parsing, so a change on either side that breaks the fit is caught here.
 *
 * Firmware facts these lock in:
 *  - numbers are printed with %.2f ("22.40"), not as integers
 *  - ts is epoch seconds once NTP syncs, otherwise 0
 *  - a metric that is not available this cycle is omitted entirely
 *  - soil_moisture is sent as a percent (0-100), already calibrated on the device
 *  - temp_c / rh_pct come from the DHT11, not the SEN63C
 *  - every command is answered {"cmd_id":"...","ok":false} (no relay or command handling yet)
 */

const FULL =
  '{"device_id":"esp32-pot-01","ts":1731000000,"fw":"0.1.0","metrics":{"co2_ppm":812.00,"temp_c":22.00,"rh_pct":48.00,"pm1_0":3.20,"pm2_5":5.10,"pm4_0":6.00,"pm10_0":6.40,"soil_moisture":38.00,"soil_temp_c":21.80}}'
const NO_CLOCK = '{"device_id":"esp32-pot-01","ts":0,"fw":"0.1.0","metrics":{"temp_c":22.00,"rh_pct":48.00}}'
const NO_AIR_SENSOR =
  '{"device_id":"esp32-pot-01","ts":1731000030,"fw":"0.1.0","metrics":{"temp_c":22.00,"rh_pct":48.00,"soil_moisture":38.00,"soil_temp_c":21.80}}'

const TOPIC = 'deem/esp32-pot-01/telemetry'
const NOW = 1_731_000_100

const dracaena = {
  plant_type_id: 'dracaena',
  common_names: ['dracaena'],
  scientific_name: '',
  thresholds: { temp_c: { min: 10, max: 35 }, rh_pct: { min: 30, max: 85 }, soil_moisture: { min: 15, max: 60 } },
  care: {},
  solutions: [],
} as unknown as PlantType

describe("Zion's firmware messages", () => {
  it('a full sample parses with every contract metric', () => {
    const t = parseTelemetryMessage(TOPIC, FULL, NOW)
    expect(t.device_id).toBe('esp32-pot-01')
    expect(t.ts).toBe(1731000000)
    expect(t.fw).toBe('0.1.0')
    expect(Object.keys(t.metrics).sort()).toEqual(
      ['co2_ppm', 'pm1_0', 'pm10_0', 'pm2_5', 'pm4_0', 'rh_pct', 'soil_moisture', 'soil_temp_c', 'temp_c'].sort(),
    )
    expect(t.metrics.temp_c).toBe(22)
    expect(t.metrics.pm2_5).toBeCloseTo(5.1)
  })

  it('soil moisture arrives as a percent and is used as is (no raw conversion)', () => {
    expect(parseTelemetryMessage(TOPIC, FULL, NOW).metrics.soil_moisture).toBe(38)
  })

  it('ts 0 (no NTP) falls back to arrival time', () => {
    const t = parseTelemetryMessage(TOPIC, NO_CLOCK, NOW)
    expect(t.ts).toBe(NOW)
    expect(t.received_ts).toBe(NOW)
  })

  it('omitted metrics (a dead sensor) are simply missing, and the sensor check flags them', () => {
    const t = parseTelemetryMessage(TOPIC, NO_AIR_SENSOR, NOW)
    expect(t.metrics.co2_ppm).toBeUndefined()
    const checks = sensorChecks(t.metrics)
    expect(checks.find((c) => c.name === 'AQI')?.ok).toBe(false)
    expect(checks.find((c) => c.name === 'Soil')?.ok).toBe(true)
    expect(checks.find((c) => c.name === 'Temp/RH')?.ok).toBe(true)
  })

  it('readings from a healthy sample raise no alerts, and a dry pot does', () => {
    expect(evaluateAlerts(dracaena, parseTelemetryMessage(TOPIC, FULL, NOW).metrics, new Set())).toEqual([])
    const dry = FULL.replace('"soil_moisture":38.00', '"soil_moisture":9.00')
    expect(evaluateAlerts(dracaena, parseTelemetryMessage(TOPIC, dry, NOW).metrics, new Set())[0].label).toBe('Soil critically dry')
  })

  it('the topics are the ones the firmware builds ("%s/%s/telemetry" with base "deem")', () => {
    expect(topics.telemetry('esp32-pot-01')).toBe('deem/esp32-pot-01/telemetry')
    expect(topics.status('esp32-pot-01')).toBe('deem/esp32-pot-01/status')
    expect(topics.cmd('esp32-pot-01')).toBe('deem/esp32-pot-01/cmd')
    expect(topics.ack('esp32-pot-01')).toBe('deem/esp32-pot-01/cmd/ack')
  })

  it('status messages: online (with fw) and the Last Will offline', () => {
    expect(parseStatusMessage('deem/esp32-pot-01/status', '{"state":"online","fw":"0.1.0"}')).toEqual({
      device_id: 'esp32-pot-01',
      state: 'online',
      fw: '0.1.0',
    })
    expect(parseStatusMessage('deem/esp32-pot-01/status', '{"state":"offline"}').state).toBe('offline')
  })

  it('the firmware refuses every command with ok:false and no detail, and the app reads that', () => {
    expect(parseAckMessage('{"cmd_id":"ui-1-1","ok":false}')).toEqual({ cmd_id: 'ui-1-1', ok: false, detail: undefined })
  })
})
