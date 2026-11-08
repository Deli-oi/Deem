// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const plants = JSON.parse(readFileSync(new URL('../public/plants/seed_all.json', import.meta.url), 'utf-8'))

// Readings our sensors report that the alerts use. Each needs a healthy range per plant.
const MEASURED = ['soil_moisture', 'temp_c', 'rh_pct']

describe('plant out-of-range data', () => {
  it('has the 12 MVP plant types', () => {
    expect(plants).toHaveLength(12)
  })

  it.each(plants.map((p) => [p.plant_type_id, p]))('%s has a complete healthy range for every measured reading', (_id, p) => {
    for (const key of MEASURED) {
      const r = p.thresholds[key]
      expect(r, `${p.plant_type_id} is missing ${key}`).toBeTruthy()
      expect(Number.isFinite(r.min), `${p.plant_type_id} ${key}.min`).toBe(true)
      expect(Number.isFinite(r.max), `${p.plant_type_id} ${key}.max`).toBe(true)
      expect(r.min, `${p.plant_type_id} ${key} min < max`).toBeLessThan(r.max)
    }
  })

  it.each(plants.map((p) => [p.plant_type_id, p]))('%s has a stored fix for each out-of-range case, triggering at its own bound', (_id, p) => {
    for (const key of MEASURED) {
      for (const [op, bound] of [['<', p.thresholds[key].min], ['>', p.thresholds[key].max]]) {
        const fix = p.solutions.find((s) => s.trigger?.metric === key && s.trigger.op === op)
        expect(fix, `${p.plant_type_id}: no fix for ${key} ${op}`).toBeTruthy()
        expect(fix.trigger.value, `${p.plant_type_id}: ${key} ${op} trigger`).toBe(bound)
        expect(fix.advice?.length ?? 0, `${p.plant_type_id}: ${key} ${op} advice`).toBeGreaterThan(10)
      }
    }
  })

  it('keeps ranges physically sensible', () => {
    for (const p of plants) {
      const { temp_c, rh_pct, soil_moisture } = p.thresholds
      expect(temp_c.min).toBeGreaterThanOrEqual(0)
      expect(temp_c.max).toBeLessThanOrEqual(45)
      expect(rh_pct.min).toBeGreaterThanOrEqual(0)
      expect(rh_pct.max).toBeLessThanOrEqual(100)
      expect(soil_moisture.min).toBeGreaterThanOrEqual(0)
      expect(soil_moisture.max).toBeLessThanOrEqual(100)
    }
  })
})
