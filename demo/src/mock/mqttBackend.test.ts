import { afterEach, describe, expect, it, vi } from 'vitest'
import { HourlyHealthStore } from '../lib/historyStore'
import type { BackendEvent } from '../lib/backendTypes'
import type { SensorProgress } from '../lib/telemetry'
import type { PlantType } from '../lib/types'
import { MqttBackend } from './mqttBackend'
import type { MqttLink } from './mqttBackend'

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v))

function fakeLink() {
  let onConnect: () => void = () => {}
  let onDisconnect: () => void = () => {}
  let onMessage: (t: string, p: Uint8Array) => void = () => {}
  const subscribed: string[] = []
  const link: MqttLink = {
    onConnect: (cb) => (onConnect = cb),
    onDisconnect: (cb) => (onDisconnect = cb),
    onMessage: (cb) => (onMessage = cb),
    subscribe: (list) => subscribed.push(...list),
    end: () => {},
  }
  return {
    link,
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

const TEL = 'deem/esp32-pot-01/telemetry'
const STATUS = 'deem/esp32-pot-01/status'
const good = { device_id: 'esp32-pot-01', ts: 0, metrics: { co2_ppm: 600, temp_c: 22, rh_pct: 45, soil_moisture: 40 } }
const online = { state: 'online', fw: '0.1.0' }

afterEach(() => vi.useRealTimers())

describe('MqttBackend', () => {
  it('listens to this pot only, and only to telemetry and status (it sends no commands)', () => {
    const { f } = setup()
    f.connect()
    expect(f.subscribed).toEqual(['deem/esp32-pot-01/telemetry', 'deem/esp32-pot-01/status'])
    expect('publish' in f.link).toBe(false)
  })

  it('emits scored telemetry and ignores other pots and bad packets', async () => {
    const { f, backend, events } = setup()
    f.connect()
    backend.selectPlant(plant)
    f.message('deem/esp32-pot-02/telemetry', good)
    f.message(TEL, { metrics: 'broken' })
    expect(events.filter((e) => e.type === 'telemetry')).toHaveLength(0)

    f.message(TEL, good)
    const t = events.find((e) => e.type === 'telemetry')
    expect(t?.type === 'telemetry' && t.telemetry.health_score).toBeGreaterThan(80)
    expect((await backend.getHistory('dracaena')).length).toBe(1)
  })

  it('reports the link down on Last Will and when the broker drops', () => {
    const { f, events } = setup()
    f.connect()
    f.message(STATUS, online)
    f.message(STATUS, { state: 'offline' })
    f.message(STATUS, online)
    f.disconnect()
    const links = events.filter((e) => e.type === 'link').map((e) => e.type === 'link' && e.online)
    // connected but device not seen yet -> online -> Last Will -> back -> broker drops
    expect(links).toEqual([false, true, false, true, false])
  })

  it('a stored reading alone does not mean the device is up: only its status does', () => {
    const { f, events } = setup()
    f.connect()
    f.message(TEL, good)
    expect(events.filter((e) => e.type === 'link').map((e) => e.type === 'link' && e.online)).toEqual([false])
  })

  it('TEST (collectNow) returns the newest reading and asks the device for nothing', async () => {
    const { f, backend } = setup()
    f.connect()
    f.message(TEL, { ...good, ts: 100 })
    f.message(TEL, { ...good, ts: 200 })
    expect((await backend.collectNow('dracaena')).ts).toBe(200)
  })

  it('waits for a first reading, and gives up with a clear error', async () => {
    vi.useFakeTimers()
    const { f, backend } = setup()
    f.connect()
    const pending = backend.getLatestTelemetry('dracaena')
    const assertion = expect(pending).rejects.toThrow('No data from esp32-pot-01')
    await vi.advanceTimersByTimeAsync(31_000)
    await assertion
  })
})

describe('setup sensor check', () => {
  const states = (p: SensorProgress[]) => p.map((x) => x.state)

  it('waits for the device to be online before it believes any reading', async () => {
    const { f, backend } = setup()
    f.connect()
    f.message(TEL, good) // a stored reading is there, but the device has not said it is up
    const seen: SensorProgress[][] = []
    const done = backend.checkSensors((p) => seen.push(p))
    expect(states(seen[seen.length - 1])).toEqual(['pending', 'pending', 'pending'])
    f.message(STATUS, online)
    const result = await done
    expect(states(result)).toEqual(['ok', 'ok', 'ok'])
  })

  it('turns each sensor to ok as its readings arrive, in the firmware init order', async () => {
    const { f, backend } = setup()
    f.connect()
    f.message(STATUS, online)
    const seen: string[][] = []
    const done = backend.checkSensors((p) => seen.push(states(p)))
    expect(seen[seen.length - 1]).toEqual(['pending', 'pending', 'pending'])

    f.message(TEL, { ...good, metrics: { temp_c: 22, rh_pct: 45 } }) // only the DHT11 so far
    expect(seen[seen.length - 1]).toEqual(['ok', 'pending', 'pending'])

    f.message(TEL, { ...good, metrics: { temp_c: 22, rh_pct: 45, co2_ppm: 610 } }) // air sensor warmed up
    expect(seen[seen.length - 1]).toEqual(['ok', 'ok', 'pending'])

    f.message(TEL, good) // soil too
    expect(states(await done)).toEqual(['ok', 'ok', 'ok'])
  })

  it('fails a sensor immediately when the device reports that its init failed', async () => {
    const { f, backend } = setup()
    f.connect()
    f.message(STATUS, { ...online, sensors: { dht: true, air: false, soil: true } })
    f.message(TEL, { ...good, metrics: { temp_c: 22, rh_pct: 45, soil_moisture: 40 } })
    const result = await backend.checkSensors(() => {})
    expect(states(result)).toEqual(['ok', 'fail', 'ok'])
  })

  it('after a minute, fails whatever has still not produced readings', async () => {
    vi.useFakeTimers()
    const { f, backend } = setup()
    f.connect()
    f.message(STATUS, online)
    f.message(TEL, { ...good, metrics: { temp_c: 22, rh_pct: 45 } })
    const done = backend.checkSensors(() => {})
    await vi.advanceTimersByTimeAsync(59_000)
    let settled = false
    void done.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false) // still patient at 59 s
    await vi.advanceTimersByTimeAsync(2_000)
    expect(states(await done)).toEqual(['ok', 'fail', 'fail'])
  })

  it('rejects if the device never comes online', async () => {
    vi.useFakeTimers()
    const { f, backend } = setup()
    f.connect()
    const done = backend.checkSensors(() => {})
    const assertion = expect(done).rejects.toThrow('offline')
    await vi.advanceTimersByTimeAsync(61_000)
    await assertion
  })
})
