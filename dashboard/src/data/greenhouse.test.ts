import { describe, expect, it } from 'vitest'
import { PLANT_TYPES, greenhouseAt, summarize, summarizeByType } from './greenhouse'
import { BED_Y, COLS_PER_BED, MAP_COLS, MAP_ROWS, PLANT_TILES, SOIL_ISSUES, ZONES } from './layout'
import { AUTO_CORRECTED, comfort, statusFor } from '../lib/health'

const NOW = Date.UTC(2026, 10, 8, 15, 30)
const g = greenhouseAt(NOW)

describe('greenhouse layout and stub data', () => {
  it('has 45 plants: 3 zones x 3 beds x 5, with unique ids', () => {
    expect(g.plants).toHaveLength(45)
    expect(new Set(g.plants.map((p) => p.id)).size).toBe(45)
    expect(ZONES).toHaveLength(3)
    expect(BED_Y).toHaveLength(3)
    expect(COLS_PER_BED).toBe(5)
  })

  it('uses every one of the 12 plant types at least once', () => {
    expect(new Set(g.plants.map((p) => p.typeId)).size).toBe(PLANT_TYPES.length)
    expect(PLANT_TYPES).toHaveLength(12)
  })

  it('keeps every plant on the map without overlapping another', () => {
    const boxes = g.plants.map((p) => p.tile)
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + PLANT_TILES).toBeLessThanOrEqual(MAP_COLS)
      expect(b.y + PLANT_TILES).toBeLessThanOrEqual(MAP_ROWS)
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap = a.x < b.x + PLANT_TILES && b.x < a.x + PLANT_TILES && a.y < b.y + PLANT_TILES && b.y < a.y + PLANT_TILES
        expect(overlap, `${g.plants[i].id} overlaps ${g.plants[j].id}`).toBe(false)
      }
    }
  })

  it('is deterministic: the same moment is the same greenhouse', () => {
    const again = greenhouseAt(NOW)
    expect(again.plants.map((p) => p.health)).toEqual(g.plants.map((p) => p.health))
    expect(again.hubs).toEqual(g.hubs)
  })

  it('drifts over time like a live greenhouse', () => {
    const later = greenhouseAt(NOW + 25_000)
    const sig = (x: typeof g) => x.plants.map((p) => `${p.metrics.temp_c}/${p.metrics.soil_temp_c}/${p.metrics.soil_moisture}`).join()
    expect(sig(later)).not.toBe(sig(g))
  })

  it('reports every sensor the mini display needs, for every plant', () => {
    for (const p of g.plants) {
      for (const key of ['soil_moisture', 'soil_ec', 'soil_temp_c', 'temp_c', 'rh_pct', 'co2_ppm', 'pm2_5']) {
        expect(Number.isFinite(p.metrics[key]), `${p.id} ${key}`).toBe(true)
      }
      expect(p.history).toHaveLength(24)
      expect(p.history[23].avg_health).toBeLessThanOrEqual(100)
    }
  })
})

describe('what needs a human', () => {
  it('only soil-quality problems alert: the controller keeps climate, air and watering in range', () => {
    for (const p of g.plants) for (const a of p.alerts) expect(AUTO_CORRECTED.has(a.metric), `${p.id}: ${a.metric}`).toBe(false)
  })

  it('alerts exactly the plants with a soil mineral issue', () => {
    expect(g.plants.filter((p) => p.alerts.length > 0).map((p) => p.id).sort()).toEqual(Object.keys(SOIL_ISSUES).sort())
    for (const p of g.plants.filter((x) => x.alerts.length > 0)) {
      expect(p.alerts[0].metric).toBe('soil_ec')
      expect(p.status).toBe('alert')
      expect(p.health).toBeLessThanOrEqual(64)
    }
  })

  it('keeps every other reading inside its healthy range (the controller is working)', () => {
    for (const p of g.plants) {
      const t = p.type.thresholds
      expect(p.metrics.soil_moisture, `${p.id} moisture`).toBeGreaterThanOrEqual(t.soil_moisture.min as number)
      expect(p.metrics.soil_moisture, `${p.id} moisture`).toBeLessThanOrEqual(t.soil_moisture.max as number)
      expect(p.metrics.temp_c, `${p.id} temp`).toBeGreaterThanOrEqual(t.temp_c.min as number)
      expect(p.metrics.temp_c, `${p.id} temp`).toBeLessThanOrEqual(t.temp_c.max as number)
      expect(p.metrics.rh_pct, `${p.id} rh`).toBeGreaterThanOrEqual(t.rh_pct.min as number)
      expect(p.metrics.rh_pct, `${p.id} rh`).toBeLessThanOrEqual(t.rh_pct.max as number)
    }
  })

  it('still alerts at any time of day, not just at one moment', () => {
    for (let h = 0; h < 24; h += 3) {
      const at = greenhouseAt(NOW + h * 3600_000)
      expect(at.plants.filter((p) => p.alerts.length > 0)).toHaveLength(Object.keys(SOIL_ISSUES).length)
    }
  })
})

describe('rollups', () => {
  it('summarizes the greenhouse', () => {
    const s = summarize(g)
    expect(s.plantCount).toBe(45)
    expect(s.alertPlants).toBe(5)
    expect(s.healthy + s.watch + s.alertPlants).toBe(45)
    expect(s.avgHealth).toBeGreaterThan(80)
    expect(s.avgHealth).toBeLessThan(99)
    expect(s.mineralsInRange).toBe(Math.round((40 / 45) * 100))
  })

  it('summarizes each plant type and accounts for every plant', () => {
    const types = summarizeByType(g)
    expect(types).toHaveLength(12)
    expect(types.reduce((a, t) => a + t.count, 0)).toBe(45)
    expect(types.reduce((a, t) => a + t.alerts, 0)).toBe(5)
    for (const t of types) {
      expect(t.avgHealth).toBeGreaterThan(0)
      expect(t.avgHealth).toBeLessThanOrEqual(100)
    }
  })

  it('has an air hub per zone with in-range air', () => {
    expect(g.hubs.map((h) => h.zone)).toEqual(['A', 'B', 'C'])
    for (const h of g.hubs) {
      expect(h.metrics.co2_ppm).toBeLessThan(1500)
      expect(h.metrics.pm2_5).toBeLessThan(35)
      expect(h.ventPct).toBeGreaterThanOrEqual(12)
      expect(h.ventPct).toBeLessThanOrEqual(90)
    }
  })
})

describe('health scoring', () => {
  it('is 100 at the middle of the range, eases to 76 at the edge, and drops fast outside', () => {
    expect(comfort(50, 0, 100)).toBe(100)
    expect(comfort(100, 0, 100)).toBeCloseTo(76)
    expect(comfort(0, 0, 100)).toBeCloseTo(76)
    expect(comfort(120, 0, 100)).toBeLessThan(76)
    expect(comfort(5, null, null)).toBe(100)
  })

  it('gets steadily worse the further a reading is from the middle', () => {
    const scores = [50, 60, 70, 80, 90, 100, 110].map((v) => comfort(v, 0, 100))
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThan(scores[i - 1])
  })

  it('ranks status: an alert always wins', () => {
    expect(statusFor(99, [])).toBe('great')
    expect(statusFor(85, [])).toBe('good')
    expect(statusFor(70, [])).toBe('watch')
    expect(statusFor(99, [{ metric: 'soil_ec', direction: 'low', value: 1, limit: 2, label: 'x' }])).toBe('alert')
  })
})
