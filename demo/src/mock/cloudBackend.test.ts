import { afterEach, describe, expect, it } from 'vitest'
import { CloudBackend } from './cloudBackend'
import { MockBackend } from './backend'
import type { BackendEvent } from '../lib/backendTypes'

const ROW = {
  device_id: 'esp32-pot-01',
  ts: '2026-11-08T15:22:57.561Z',
  fw: '0.1.0',
  metrics: { co2_ppm: 600, temp_c: 24, rh_pct: 40, soil_moisture: 55, soil_temp_c: 25 },
}

const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response

let made: CloudBackend[] = []
function make(fetchImpl: typeof fetch) {
  const b = new CloudBackend({
    deviceId: 'esp32-pot-01',
    base: 'https://ingest.example/',
    knowledge: new MockBackend({ scenario: null }),
    fetchImpl,
    pollMs: 60_000,
  })
  made.push(b)
  return b
}
afterEach(() => {
  made.forEach((b) => b.dispose())
  made = []
})

describe('CloudBackend', () => {
  it('shows the newest stored reading with its own timestamp', async () => {
    const urls: string[] = []
    const b = make((async (url: string) => {
      urls.push(url)
      return reply({ devices: [ROW] })
    }) as unknown as typeof fetch)
    const t = await b.getLatestTelemetry('dracaena')
    expect(urls[0]).toBe('https://ingest.example/api/devices')
    expect(t.device_id).toBe('esp32-pot-01')
    expect(t.ts).toBe(Math.floor(Date.parse(ROW.ts) / 1000))
    expect(t.metrics.soil_moisture).toBe(55)
  })

  it('announces the link and the reading to subscribers', async () => {
    const events: BackendEvent[] = []
    const b = make((async () => reply({ devices: [ROW] })) as unknown as typeof fetch)
    b.subscribe((e) => events.push(e))
    await b.getLatestTelemetry('x')
    expect(events.some((e) => e.type === 'link' && e.online)).toBe(true)
  })

  it('reports each sensor from the stored metrics', async () => {
    const soilOnly = { ...ROW, metrics: { soil_moisture: 0, soil_temp_c: 25 } }
    const b = make((async () => reply({ devices: [soilOnly] })) as unknown as typeof fetch)
    const progress = await b.checkSensors(() => {})
    expect(progress.map((p) => [p.id, p.state])).toEqual([['dht', 'fail'], ['air', 'fail'], ['soil', 'ok']])
  })

  it('ignores other devices and rejects when there is no reading', async () => {
    const b = make((async () => reply({ devices: [{ ...ROW, device_id: 'esp32-pot-09' }] })) as unknown as typeof fetch)
    await expect(b.getLatestTelemetry('x')).rejects.toThrow()
  })

  it('rejects when the cloud is unreachable', async () => {
    const b = make((async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch)
    await expect(b.getLatestTelemetry('x')).rejects.toThrow()
  })
})
