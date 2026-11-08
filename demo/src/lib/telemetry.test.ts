import { describe, expect, it } from 'vitest'
import { SENSORS, normalizeSoil, parseStatusMessage, parseTelemetryMessage, sensorProgress, topics } from './telemetry'

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

describe('status and topics', () => {
  it('parses status', () => {
    expect(parseStatusMessage('deem/esp32-pot-01/status', '{"state":"offline"}')).toEqual({
      device_id: 'esp32-pot-01',
      state: 'offline',
      fw: undefined,
      sensors: undefined,
    })
    expect(() => parseStatusMessage('deem/esp32-pot-01/status', '{"state":"asleep"}')).toThrow()
  })

  it('reads the optional per-sensor init results', () => {
    const s = parseStatusMessage('deem/esp32-pot-01/status', '{"state":"online","fw":"0.1.0","sensors":{"dht":true,"air":false,"soil":true}}')
    expect(s.sensors).toEqual({ dht: true, air: false, soil: true })
    expect(parseStatusMessage('deem/esp32-pot-01/status', '{"state":"online","sensors":{"dht":"yes"}}').sensors).toBeUndefined()
    expect(parseStatusMessage('deem/esp32-pot-01/status', '{"state":"online","sensors":[]}').sensors).toBeUndefined()
  })

  it('uses the contract topics (the app sends no commands, so only telemetry and status)', () => {
    expect(topics.telemetry('esp32-pot-01')).toBe('deem/esp32-pot-01/telemetry')
    expect(topics.status('esp32-pot-01')).toBe('deem/esp32-pot-01/status')
  })
})

describe('sensor progress (setup check)', () => {
  const all = { temp_c: 22, rh_pct: 48, co2_ppm: 600, soil_moisture: 40 }

  it('lists the sensors in the firmware init order: DHT11, SEN63C, Stemma soil', () => {
    expect(SENSORS.map((s) => s.id)).toEqual(['dht', 'air', 'soil'])
    expect(sensorProgress(undefined, undefined, false).map((p) => p.name)).toEqual(['Temp/RH', 'AQI', 'Soil'])
  })

  it('is all pending before anything has arrived', () => {
    expect(sensorProgress(undefined, undefined, false).map((p) => p.state)).toEqual(['pending', 'pending', 'pending'])
  })

  it('marks a sensor ok as soon as its readings are there', () => {
    const states = sensorProgress({ temp_c: 22, rh_pct: 48 }, undefined, false).map((p) => p.state)
    expect(states).toEqual(['ok', 'pending', 'pending'])
    expect(sensorProgress(all, undefined, false).every((p) => p.state === 'ok')).toBe(true)
  })

  it('needs both temperature and humidity for the DHT11', () => {
    expect(sensorProgress({ temp_c: 22 }, undefined, false)[0].state).toBe('pending')
  })

  it('fails a sensor right away when the device says its init failed', () => {
    const states = sensorProgress({ temp_c: 22, rh_pct: 48 }, { dht: true, air: false, soil: true }, false).map((p) => p.state)
    expect(states).toEqual(['ok', 'fail', 'pending'])
  })

  it('a failed init is overruled if readings show up anyway', () => {
    expect(sensorProgress(all, { air: false }, false)[1].state).toBe('ok')
  })

  it('fails whatever is still pending once we stop waiting', () => {
    expect(sensorProgress({ temp_c: 22, rh_pct: 48 }, undefined, true).map((p) => p.state)).toEqual(['ok', 'fail', 'fail'])
  })
})
