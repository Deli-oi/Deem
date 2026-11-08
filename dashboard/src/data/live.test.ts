import { describe, expect, it } from 'vitest'
import { greenhouseAt } from './greenhouse'
import { hourlyHealth, isFresh, liveConfig, LIVE_STALE_MS, withLivePlant } from './live'
import type { LiveReading } from './live'

const NOW = Date.UTC(2026, 10, 8, 15, 0, 0)
const cfg = { plantId: 'A-1-1', deviceId: 'esp32-pot-01' }
const reading = (over: Partial<LiveReading> = {}, ageMin = 3): LiveReading => ({
  device_id: 'esp32-pot-01',
  ts: new Date(NOW - ageMin * 60_000).toISOString(),
  fw: '0.1.0',
  metrics: { temp_c: 22, rh_pct: 45, co2_ppm: 600, soil_moisture: 40, soil_temp_c: 21 },
  ...over,
})

describe('live pot on the dashboard', () => {
  it('replaces exactly one simulated plant with the real reading, marked live', () => {
    const g = greenhouseAt(NOW)
    const out = withLivePlant(g, cfg, reading(), [], NOW)
    const live = out.plants.filter((p) => p.live)
    expect(live.map((p) => p.id)).toEqual(['A-1-1'])
    expect(live[0].metrics.co2_ppm).toBe(600)
    expect(live[0].telemetry.device_id).toBe('esp32-pot-01')
    expect(out.plants.length).toBe(g.plants.length)
    expect(out.plants.filter((p) => !p.live).every((p, i) => p === g.plants.filter((q) => q.id !== 'A-1-1')[i])).toBe(true)
  })

  it('keeps simulated values for what the real pot does not measure', () => {
    const g = greenhouseAt(NOW)
    const sim = g.plants.find((p) => p.id === 'A-1-1')!
    const live = withLivePlant(g, cfg, reading(), [], NOW).plants.find((p) => p.live)!
    expect(live.metrics.soil_ec).toBe(sim.metrics.soil_ec)
  })

  it('a dry real pot raises an alert (nothing is auto-corrected for a real device)', () => {
    const g = greenhouseAt(NOW)
    const dry = reading({ metrics: { temp_c: 22, rh_pct: 45, co2_ppm: 600, soil_moisture: 1, soil_temp_c: 21 } })
    const live = withLivePlant(g, cfg, dry, [], NOW).plants.find((p) => p.live)!
    expect(live.alerts.length).toBeGreaterThan(0)
    expect(live.health).toBeLessThanOrEqual(64)
  })

  it('shows the simulation when there is no reading, or it is too old to call current', () => {
    const g = greenhouseAt(NOW)
    expect(withLivePlant(g, cfg, null, [], NOW)).toBe(g)
    const old = reading({}, LIVE_STALE_MS / 60_000 + 5)
    expect(isFresh(old, NOW)).toBe(false)
    expect(withLivePlant(g, cfg, old, [], NOW)).toBe(g)
  })

  it('ignores an unknown plant id instead of crashing', () => {
    const g = greenhouseAt(NOW)
    expect(withLivePlant(g, { ...cfg, plantId: 'Z-9-9' }, reading(), [], NOW)).toBe(g)
  })

  it('builds the history chart from real readings, averaged per hour', () => {
    const g = greenhouseAt(NOW)
    const plant = g.plants.find((p) => p.id === 'A-1-1')!
    const rows = [reading({}, 130), reading({}, 125), reading({}, 5)]
    const pts = hourlyHealth(plant, rows)
    expect(pts.length).toBeGreaterThanOrEqual(2)
    expect(pts.every((p) => p.avg_health >= 0 && p.avg_health <= 100)).toBe(true)
    const live = withLivePlant(g, cfg, reading(), rows, NOW).plants.find((p) => p.live)!
    expect(live.history).toEqual(hourlyHealth(plant, rows))
  })

  it('reads its settings from env, with sensible defaults and no ingest URL meaning simulation only', () => {
    expect(liveConfig({})).toEqual({ ingestUrl: null, deviceId: 'esp32-pot-01', plantId: 'A-1-1' })
    expect(liveConfig({ VITE_INGEST_URL: 'https://ingest.example.app/', VITE_LIVE_PLANT_ID: 'B-1-2' })).toMatchObject({
      ingestUrl: 'https://ingest.example.app',
      plantId: 'B-1-2',
    })
  })
})
