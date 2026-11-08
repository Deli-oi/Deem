import { describe, expect, it } from 'vitest'
import { healthLabel, scoreHealth } from './healthScore'
import type { Metrics, PlantType } from './types'

const plant = {
  plant_type_id: 'dracaena',
  common_names: ['dracaena'],
  scientific_name: 'Dracaena fragrans',
  thresholds: {
    temp_c: { min: 10, max: 35 },
    rh_pct: { min: 30, max: 85 },
    soil_moisture: { min: 15, max: 60 },
  },
  care: {},
  solutions: [],
} as PlantType

const healthy: Metrics = {
  co2_ppm: 600,
  temp_c: 22,
  rh_pct: 50,
  pm1_0: 2,
  pm2_5: 3,
  pm4_0: 3,
  pm10_0: 4,
  soil_moisture: 40,
  soil_temp_c: 21,
}

describe('scoreHealth', () => {
  it('scores in-range metrics highly', () => {
    expect(scoreHealth(healthy, plant)).toBeGreaterThanOrEqual(85)
  })

  it('penalizes dry soil', () => {
    const dry = { ...healthy, soil_moisture: 5 }
    expect(scoreHealth(dry, plant)).toBeLessThan(scoreHealth(healthy, plant))
  })

  it('maps labels', () => {
    expect(healthLabel(90)).toBe('Thriving')
    expect(healthLabel(50)).toBe('Stressed')
  })
})
