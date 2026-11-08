import { describe, expect, it } from 'vitest'
import { AIR_QUALITY_LIMITS, AIR_QUALITY_SOLUTIONS } from './airQuality'
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
    expect(dry).toEqual([{ metric: 'soil_moisture', direction: 'low', value: 9, limit: 15, label: 'Soil critically dry' }])
    const wet = evaluateAlerts(plant, { ...healthy, soil_moisture: 78 }, new Set())
    expect(wet[0].label).toBe('Soil critically wet')
  })

  it('alerts on temperature and humidity', () => {
    expect(evaluateAlerts(plant, { ...healthy, temp_c: 8.5 }, new Set())[0].label).toBe('Critically cold')
    expect(evaluateAlerts(plant, { ...healthy, temp_c: 40 }, new Set())[0].label).toBe('Critically hot')
    expect(evaluateAlerts(plant, { ...healthy, rh_pct: 20 }, new Set())[0].label).toBe('Air critically dry')
    expect(evaluateAlerts(plant, { ...healthy, rh_pct: 90 }, new Set())[0].label).toBe('Air critically humid')
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
    expect(left.map((a) => a.label)).toEqual(['Soil minerals critically low'])
  })
})

describe('blanket air-quality alerts (same for every plant)', () => {
  const none = new Set<string>()

  it('alerts on stuffy air and on dust', () => {
    expect(evaluateAlerts(plant, { ...healthy, co2_ppm: 1650 }, none)[0]).toMatchObject({ metric: 'co2_ppm', direction: 'high', limit: 1500, label: 'CO2 critically high' })
    expect(evaluateAlerts(plant, { ...healthy, pm2_5: 40 }, none)[0].label).toBe('Fine dust critically high')
    expect(evaluateAlerts(plant, { ...healthy, pm10_0: 200 }, none)[0].label).toBe('Dust critically high')
  })

  it('stays quiet at or below the limit, so a busy room does not set it off', () => {
    expect(evaluateAlerts(plant, { ...healthy, co2_ppm: 1500, pm2_5: 35, pm10_0: 150 }, none)).toEqual([])
    expect(evaluateAlerts(plant, { ...healthy, co2_ppm: 1200 }, none)).toEqual([])
  })

  it('never alerts on low values, or on PM1.0 / PM4.0 (no standard)', () => {
    expect(evaluateAlerts(plant, { ...healthy, co2_ppm: 200 }, none)).toEqual([])
    expect(evaluateAlerts(plant, { ...healthy, pm1_0: 999, pm4_0: 999 }, none)).toEqual([])
  })

  it('applies to every plant, and a plant-specific range wins if it ever defines one', () => {
    const picky = { ...plant, thresholds: { ...plant.thresholds, co2_ppm: { min: null, max: 800 } } } as unknown as PlantType
    expect(evaluateAlerts(plant, { ...healthy, co2_ppm: 900 }, none)).toEqual([])
    expect(evaluateAlerts(picky, { ...healthy, co2_ppm: 900 }, none)).toHaveLength(1)
  })

  it('lists air quality after the plant readings', () => {
    const all = evaluateAlerts(plant, { temp_c: 5, rh_pct: 99, soil_moisture: 1, co2_ppm: 2000, pm2_5: 90 }, none)
    expect(all.map((a) => a.metric)).toEqual(['soil_moisture', 'temp_c', 'rh_pct', 'co2_ppm', 'pm2_5'])
  })

  it('later: the biosphere controller can take over ventilation, and the alert goes quiet', () => {
    expect(evaluateAlerts(plant, { ...healthy, co2_ppm: 2000 }, new Set(['co2_ppm']))).toEqual([])
  })

  it('has a stored fix for each limit that triggers at exactly that limit', () => {
    for (const [metric, range] of Object.entries(AIR_QUALITY_LIMITS)) {
      const fix = AIR_QUALITY_SOLUTIONS.find((s) => s.trigger.metric === metric)
      expect(fix, `no fix for ${metric}`).toBeTruthy()
      expect(fix?.trigger).toMatchObject({ op: '>', value: range.max })
    }
  })
})
