import { describe, expect, it } from 'vitest'
import {
  normalizeSoil,
  parseAckMessage,
  parseStatusMessage,
  parseTelemetryMessage,
  relayCommand,
  sensorChecks,
  topics,
} from './telemetry'

const NOW = 1_731_000_000

describe('telemetry message (contract v1)', () => {
  it('parses the contract example and stamps arrival time when ts is 0', () => {
    const t = parseTelemetryMessage(
      'deem/esp32-pot-01/telemetry',
      JSON.stringify({
        device_id: 'esp32-pot-01',
        ts: 0,
        fw: '0.1.0',
        metrics: { co2_ppm: 812, temp_c: 22.4, rh_pct: 48.1, pm2_5: 5.1, soil_moisture: 41, soil_temp_c: 21.8 },
      }),
      NOW,
    )
    expect(t.device_id).toBe('esp32-pot-01')
    expect(t.ts).toBe(NOW)
    expect(t.received_ts).toBe(NOW)
    expect(t.metrics.co2_ppm).toBe(812)
  })

  it('keeps the device clock when ts is set', () => {
    const t = parseTelemetryMessage('deem/esp32-pot-01/telemetry', '{"ts":1730000000,"metrics":{"temp_c":20}}', NOW)
    expect(t.ts).toBe(1730000000)
  })

  it('derives device_id from the topic when the body omits it', () => {
    const t = parseTelemetryMessage('deem/esp32-pot-02/telemetry', '{"metrics":{"temp_c":20}}', NOW)
    expect(t.device_id).toBe('esp32-pot-02')
  })

  it('accepts a binary payload', () => {
    const bytes = new TextEncoder().encode('{"metrics":{"temp_c":21}}')
    expect(parseTelemetryMessage('deem/esp32-pot-01/telemetry', bytes, NOW).metrics.temp_c).toBe(21)
  })

  it('rejects malformed messages', () => {
    const topic = 'deem/esp32-pot-01/telemetry'
    expect(() => parseTelemetryMessage(topic, 'not json', NOW)).toThrow()
    expect(() => parseTelemetryMessage(topic, '[]', NOW)).toThrow()
    expect(() => parseTelemetryMessage(topic, '{"ts":1}', NOW)).toThrow()
    expect(() => parseTelemetryMessage(topic, '{"metrics":{"temp_c":"hot"}}', NOW)).toThrow()
    expect(() => parseTelemetryMessage('deem/esp32-pot-01/status', '{"metrics":{"a":1}}', NOW)).toThrow()
  })
})

describe('soil moisture units', () => {
  it('passes percent values through', () => {
    expect(normalizeSoil(38)).toBe(38)
    expect(normalizeSoil(100)).toBe(100)
  })

  it('converts raw seesaw readings to percent and clamps', () => {
    expect(normalizeSoil(200)).toBe(0)
    expect(normalizeSoil(1100)).toBe(50)
    expect(normalizeSoil(2000)).toBe(100)
    expect(normalizeSoil(5000)).toBe(100)
  })

  it('is applied while parsing', () => {
    const t = parseTelemetryMessage('deem/esp32-pot-01/telemetry', '{"metrics":{"soil_moisture":1100}}', NOW)
    expect(t.metrics.soil_moisture).toBe(50)
  })
})

describe('status, ack, commands', () => {
  it('parses status', () => {
    expect(parseStatusMessage('deem/esp32-pot-01/status', '{"state":"offline"}')).toEqual({
      device_id: 'esp32-pot-01',
      state: 'offline',
      fw: undefined,
    })
    expect(() => parseStatusMessage('deem/esp32-pot-01/status', '{"state":"asleep"}')).toThrow()
  })

  it('parses ack', () => {
    expect(parseAckMessage('{"cmd_id":"a1","ok":true,"detail":"relay 1 on"}')).toEqual({
      cmd_id: 'a1',
      ok: true,
      detail: 'relay 1 on',
    })
    expect(() => parseAckMessage('{"ok":true}')).toThrow()
  })

  it('builds set_relay exactly as the contract shows', () => {
    expect(relayCommand(1, true, 'c1', NOW)).toEqual({
      cmd_id: 'c1',
      ts: NOW,
      action: 'set_relay',
      params: { channel: 1, state: 'on' },
    })
    expect(relayCommand(1, false, 'c2', NOW).params).toEqual({ channel: 1, state: 'off' })
  })

  it('uses the contract topics', () => {
    expect(topics.telemetry('esp32-pot-01')).toBe('deem/esp32-pot-01/telemetry')
    expect(topics.cmd('esp32-pot-01')).toBe('deem/esp32-pot-01/cmd')
    expect(topics.ack('esp32-pot-01')).toBe('deem/esp32-pot-01/cmd/ack')
  })
})

describe('sensor checks', () => {
  it('passes when each sensor reports its metrics', () => {
    const checks = sensorChecks({ soil_moisture: 40, co2_ppm: 600, temp_c: 22, rh_pct: 50 })
    expect(checks.every((c) => c.ok)).toBe(true)
  })

  it('flags a sensor whose metrics are missing', () => {
    const checks = sensorChecks({ co2_ppm: 600, temp_c: 22, rh_pct: 50 })
    expect(checks.find((c) => c.name === 'Soil')?.ok).toBe(false)
  })
})
