import { describe, expect, it } from 'vitest'
import { matchPlantLocal } from './matchPlant'
import type { PlantType } from './types'

const plants = [
  {
    plant_type_id: 'dracaena',
    common_names: ['dracaena', 'corn plant'],
    scientific_name: 'Dracaena fragrans',
    thresholds: { temp_c: { min: 10, max: 35 }, rh_pct: { min: 30, max: 85 }, soil_moisture: { min: 15, max: 60 } },
    care: {},
    solutions: [],
  },
  {
    plant_type_id: 'panda_plant',
    common_names: ['panda plant'],
    scientific_name: 'Kalanchoe tomentosa',
    thresholds: { temp_c: { min: 5, max: 35 }, rh_pct: { min: 15, max: 80 }, soil_moisture: { min: 7, max: 50 } },
    care: {},
    solutions: [],
  },
] as PlantType[]

describe('matchPlantLocal', () => {
  it('matches common name', () => {
    const m = matchPlantLocal('panda plant', plants)
    expect(m?.plant.plant_type_id).toBe('panda_plant')
  })

  it('matches corn plant alias to dracaena', () => {
    const m = matchPlantLocal('corn plant', plants)
    expect(m?.plant.plant_type_id).toBe('dracaena')
  })

  it('returns null for unknown', () => {
    expect(matchPlantLocal('venus flytrap deluxe', plants)).toBeNull()
  })
})
