import { afterEach, describe, expect, it } from 'vitest'
import { CloudBackend } from './cloudBackend'
import { MockBackend } from './backend'

const FULL = { co2_ppm: 600, temp_c: 24, rh_pct: 40, pm1_0: 2, pm2_5: 3, pm4_0: 4, pm10_0: 5, soil_moisture: 55, soil_temp_c: 25 }
const row = (ts: string, metrics: object) => ({ ts, fw: '0.1.0', metrics })
const COMPLETE = row('2026-11-08T15:19:16.000Z', FULL)
const SOIL_ONLY = row('2026-11-08T15:22:57.000Z', { soil_moisture: 0, soil_temp_c: 25 })

const reply = (readings: unknown[], status = 200) => ({ ok: status < 400, status, json: async () => ({ readings }) }) as Response

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
  it('shows the last complete reading, skipping newer ones with a sensor missing', async () => {
    const urls: string[] = []
    const b = make((async (url: string) => {
      urls.push(url)
      return reply([COMPLETE, SOIL_ONLY, SOIL_ONLY]) // oldest first, like the server
    }) as unknown as typeof fetch)
    const t = await b.getLatestTelemetry('dracaena')
    expect(urls[0]).toContain('https://ingest.example/api/readings?device_id=esp32-pot-01')
    expect(t.ts).toBe(Math.floor(Date.parse(COMPLETE.ts) / 1000))
    expect(t.metrics.co2_ppm).toBe(600)
  })

  it('shows the newest reading when none is complete', async () => {
    const b = make((async () => reply([SOIL_ONLY])) as unknown as typeof fetch)
    const t = await b.getLatestTelemetry('x')
    expect(t.ts).toBe(Math.floor(Date.parse(SOIL_ONLY.ts) / 1000))
  })

  it('reports each sensor from the shown reading', async () => {
    const b = make((async () => reply([SOIL_ONLY])) as unknown as typeof fetch)
    const progress = await b.checkSensors(() => {})
    expect(progress.map((p) => [p.id, p.state])).toEqual([['dht', 'fail'], ['air', 'fail'], ['soil', 'ok']])
  })

  it('rejects when there is no reading or the cloud is unreachable', async () => {
    const none = make((async () => reply([])) as unknown as typeof fetch)
    await expect(none.getLatestTelemetry('x')).rejects.toThrow()
    const down = make((async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch)
    await expect(down.getLatestTelemetry('x')).rejects.toThrow()
  })
})
