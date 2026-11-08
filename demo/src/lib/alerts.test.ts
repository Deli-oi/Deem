import { describe, expect, it } from 'vitest'
import { evaluateAlerts } from './alerts'
import type { PlantType } from './types'

const plant = {
  plant_type_id: 'dracaena',
  common_names: ['dracaena'],
  scientific_name: '',
  thresholds: {
    temp_c: { min: 10, max: 35 },
    rh_pct: { min: 30, max: 85 },
    soil_moisture: { min: 15, max: 60 },
    soil_ec: { min: 200, max: 1500 },
    light_lux: { min: null, max: null },
  },
  care: {},
  solutions: [],
} as unknown as PlantType

const healthy = { temp_c: 22, rh_pct: 48, soil_moisture: 38 }

describe('evaluateAlerts', () => {
  it('has no alerts when everything is in range', () => {
    expect(evaluateAlerts(plant, healthy, new Set())).toEqual([])
  })

  it('alerts when soil is too dry or too wet', () => {
    const dry = evaluateAlerts(plant, { ...healthy, soil_moisture: 9 }, new Set())
    expect(dry).toEqual([{ metric: 'soil_moisture', direction: 'low', value: 9, limit: 15, label: 'Soil too dry' }])
    const wet = evaluateAlerts(plant, { ...healthy, soil_moisture: 78 }, new Set())
    expect(wet[0].label).toBe('Soil too wet')
  })

  it('alerts on temperature and humidity', () => {
    expect(evaluateAlerts(plant, { ...healthy, temp_c: 8.5 }, new Set())[0].label).toBe('Too cold')
    expect(evaluateAlerts(plant, { ...healthy, temp_c: 40 }, new Set())[0].label).toBe('Too hot')
    expect(evaluateAlerts(plant, { ...healthy, rh_pct: 20 }, new Set())[0].label).toBe('Air too dry')
    expect(evaluateAlerts(plant, { ...healthy, rh_pct: 90 }, new Set())[0].label).toBe('Air too humid')
  })

  it('treats the healthy bounds as in range', () => {
    expect(evaluateAlerts(plant, { temp_c: 10, rh_pct: 85, soil_moisture: 60 }, new Set())).toEqual([])
  })

  it('ignores metrics the device does not report, and thresholds with no bounds', () => {
    expect(evaluateAlerts(plant, { temp_c: 22 }, new Set())).toEqual([])
    expect(evaluateAlerts(plant, { ...healthy, light_lux: 5 }, new Set())).toEqual([])
  })

  it('orders soil first, then temperature, then air', () => {
    const all = evaluateAlerts(plant, { temp_c: 5, rh_pct: 99, soil_moisture: 1 }, new Set())
    expect(all.map((a) => a.metric)).toEqual(['soil_moisture', 'temp_c', 'rh_pct'])
  })

  it('later: skips metrics the biosphere corrects itself, keeps the rest (e.g. soil quality)', () => {
    const corrected = new Set(['soil_moisture', 'temp_c', 'rh_pct'])
    const metrics = { temp_c: 5, rh_pct: 99, soil_moisture: 1, soil_ec: 50 }
    expect(evaluateAlerts(plant, metrics, new Set()).length).toBe(4)
    const left = evaluateAlerts(plant, metrics, corrected)
    expect(left.map((a) => a.label)).toEqual(['Soil needs food'])
  })
})
