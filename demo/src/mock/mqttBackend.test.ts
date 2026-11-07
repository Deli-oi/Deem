import { describe, expect, it } from 'vitest'
import { HourlyHealthStore } from '../lib/historyStore'
import type { BackendEvent } from '../lib/backendTypes'
import type { PlantType } from '../lib/types'
import { MqttBackend } from './mqttBackend'
import type { MqttLink } from './mqttBackend'

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v))

function fakeLink() {
  let onConnect: () => void = () => {}
  let onDisconnect: () => void = () => {}
  let onMessage: (t: string, p: Uint8Array) => void = () => {}
  const published: Array<{ topic: string; payload: string }> = []
  const subscribed: string[] = []
  const link: MqttLink = {
    onConnect: (cb) => (onConnect = cb),
    onDisconnect: (cb) => (onDisconnect = cb),
    onMessage: (cb) => (onMessage = cb),
    subscribe: (list) => subscribed.push(...list),
    publish: (topic, payload) => published.push({ topic, payload }),
    end: () => {},
  }
  return {
    link,
    published,
    subscribed,
    connect: () => onConnect(),
    disconnect: () => onDisconnect(),
    message: (topic: string, payload: unknown) => onMessage(topic, enc(payload)),
  }
}

const plant = {
  plant_type_id: 'dracaena',
  common_names: ['Dracaena'],
  scientific_name: 'Dracaena',
  thresholds: {
    temp_c: { min: 18, max: 27 },
    rh_pct: { min: 30, max: 60 },
    soil_moisture: { min: 15, max: 60 },
  },
  care: {},
  solutions: [],
} as PlantType

function setup() {
  const f = fakeLink()
  const events: BackendEvent[] = []
  const backend = new MqttBackend({
    deviceId: 'esp32-pot-01',
    link: f.link,
    knowledge: {
      listPlants: async () => [plant],
      matchPlant: async () => null,
      ask: async (_id, q) => ({ question: q, answer: 'ok', based_on: [] }),
    },
    history: new HourlyHealthStore(null),
  })
  backend.subscribe((e) => events.push(e))
  return { f, backend, events }
}

const good = { device_id: 'esp32-pot-01', ts: 0, metrics: { co2_ppm: 600, temp_c: 22, rh_pct: 45, soil_moisture: 40 } }

describe('MqttBackend', () => {
  it('subscribes to this pot only, once connected', () => {
    const { f } = setup()
    f.connect()
    expect(f.subscribed).toEqual([
      'deem/esp32-pot-01/telemetry',
      'deem/esp32-pot-01/status',
      'deem/esp32-pot-01/cmd/ack',
    ])
  })

  it('emits scored telemetry and ignores other pots and bad packets', async () => {
    const { f, backend, events } = setup()
    f.connect()
    backend.selectPlant(plant)
    f.message('deem/esp32-pot-02/telemetry', good)
    f.message('deem/esp32-pot-01/telemetry', { metrics: 'broken' })
    expect(events.filter((e) => e.type === 'telemetry')).toHaveLength(0)

    f.message('deem/esp32-pot-01/telemetry', good)
    const t = events.find((e) => e.type === 'telemetry')
    expect(t?.type === 'telemetry' && t.telemetry.health_score).toBeGreaterThan(80)
    expect((await backend.getHistory('dracaena')).length).toBe(1)
  })

  it('reports the link down on Last Will and when the broker drops', () => {
    const { f, events } = setup()
    f.connect()
    f.message('deem/esp32-pot-01/status', { state: 'online' })
    f.message('deem/esp32-pot-01/status', { state: 'offline' })
    f.message('deem/esp32-pot-01/status', { state: 'online' })
    f.disconnect()
    const links = events.filter((e) => e.type === 'link').map((e) => e.type === 'link' && e.online)
    // connected but device not seen yet -> online -> Last Will -> back -> broker drops
    expect(links).toEqual([false, true, false, true, false])
  })

  it('checks sensors from the first telemetry message', async () => {
    const { f, backend } = setup()
    f.connect()
    const pending = backend.checkSensors()
    f.message('deem/esp32-pot-01/telemetry', { metrics: { co2_ppm: 600, temp_c: 22, rh_pct: 45 } })
    const checks = await pending
    expect(checks.find((c) => c.name === 'Soil')?.ok).toBe(false)
    expect(checks.find((c) => c.name === 'AQI')?.ok).toBe(true)
  })

  it('sends set_relay and resolves on a matching ack', async () => {
    const { f, backend } = setup()
    f.connect()
    const done = backend.setRelay(true)
    const sent = JSON.parse(f.published[0].payload)
    expect(f.published[0].topic).toBe('deem/esp32-pot-01/cmd')
    expect(sent.action).toBe('set_relay')
    expect(sent.params).toEqual({ channel: 1, state: 'on' })
    f.message('deem/esp32-pot-01/cmd/ack', { cmd_id: sent.cmd_id, ok: true })
    await expect(done).resolves.toBeUndefined()
  })

  it('rejects when the device nacks', async () => {
    const { f, backend } = setup()
    f.connect()
    const done = backend.setRelay(true)
    const sent = JSON.parse(f.published[0].payload)
    f.message('deem/esp32-pot-01/cmd/ack', { cmd_id: sent.cmd_id, ok: false, detail: 'bad channel' })
    await expect(done).rejects.toThrow('bad channel')
  })

  it('TEST sends sample_now and returns the fresh reading the ESP publishes', async () => {
    const { f, backend } = setup()
    f.connect()
    f.message('deem/esp32-pot-01/telemetry', { ...good, ts: 100 })
    const pending = backend.collectNow('dracaena')
    await Promise.resolve()
    await Promise.resolve()
    const sent = JSON.parse(f.published[0].payload)
    expect(sent.action).toBe('sample_now')
    expect(sent.params).toEqual({})
    f.message('deem/esp32-pot-01/cmd/ack', { cmd_id: sent.cmd_id, ok: true })
    await Promise.resolve()
    f.message('deem/esp32-pot-01/telemetry', { ...good, ts: 200, metrics: { ...good.metrics, temp_c: 25 } })
    const t = await pending
    expect(t.ts).toBe(200)
    expect(t.metrics.temp_c).toBe(25)
  })

  it('TEST falls back to the newest reading when the firmware refuses sample_now', async () => {
    const { f, backend } = setup()
    f.connect()
    f.message('deem/esp32-pot-01/telemetry', { ...good, ts: 100 })
    const pending = backend.collectNow('dracaena')
    await Promise.resolve()
    await Promise.resolve()
    const sent = JSON.parse(f.published[0].payload)
    f.message('deem/esp32-pot-01/cmd/ack', { cmd_id: sent.cmd_id, ok: false, detail: 'unsupported' })
    const t = await pending
    expect(t.ts).toBe(100)
  })

  it('refuses commands while disconnected', async () => {
    const { backend } = setup()
    await expect(backend.setRelay(true)).rejects.toThrow()
  })
})
