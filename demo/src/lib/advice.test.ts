// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { adviceFor, firstSentence } from './advice'
import { evaluateAlerts } from './alerts'
import type { Alert } from './alerts'
import type { PlantType } from './types'

const plants = JSON.parse(readFileSync(new URL('../../public/plants/seed_all.json', import.meta.url), 'utf-8')) as PlantType[]

const alert = (metric: string, direction: 'low' | 'high'): Alert => ({ metric, direction, value: 0, limit: 0, label: '' })

describe('firstSentence', () => {
  it('takes the first sentence', () => {
    expect(firstSentence('Water it. Then wait a week.')).toBe('Water it.')
    expect(firstSentence('Reduce heat: move away; increase airflow. Done.')).toBe('Reduce heat: move away; increase airflow.')
  })

  it('returns text with no full stop as is', () => {
    expect(firstSentence('  Open a window  ')).toBe('Open a window')
  })
})

describe('adviceFor', () => {
  it('is exactly one short sentence for every plant and every out-of-range case', () => {
    const cases: Array<[string, 'low' | 'high']> = [
      ['soil_moisture', 'low'], ['soil_moisture', 'high'], ['temp_c', 'low'], ['temp_c', 'high'], ['rh_pct', 'low'], ['rh_pct', 'high'],
      ['co2_ppm', 'high'], ['pm2_5', 'high'], ['pm10_0', 'high'], ['soil_ec', 'low'], ['soil_ec', 'high'],
    ]
    for (const plant of plants) {
      for (const [metric, direction] of cases) {
        const text = adviceFor(plant, alert(metric, direction))
        expect(text.length, `${plant.plant_type_id} ${metric} ${direction}`).toBeGreaterThan(10)
        expect(text.length, `${plant.plant_type_id} ${metric} ${direction}`).toBeLessThanOrEqual(100)
        expect(text.match(/[.!?]/g)?.length ?? 0, `${plant.plant_type_id} ${metric} ${direction}: one sentence`).toBe(1)
      }
    }
  })

  it('uses the plant\'s stored fix for the right case', () => {
    const dracaena = plants.find((p) => p.plant_type_id === 'dracaena')!
    expect(adviceFor(dracaena, alert('soil_moisture', 'low'))).toBe('Water thoroughly until water drains, then empty the saucer.')
    expect(adviceFor(dracaena, alert('soil_moisture', 'high'))).toBe('Hold off watering and improve drainage.')
  })

  it('uses the shared air-quality fix for CO2', () => {
    const text = adviceFor(plants[0], alert('co2_ppm', 'high'))
    expect(text).toMatch(/stuffy/i)
  })

  it('has a sensible answer for a reading with no fix, and for no alert', () => {
    expect(adviceFor(plants[0], alert('mystery', 'low'))).toBe('Check this reading and adjust the conditions.')
    expect(adviceFor(plants[0], undefined)).toBe('Check this reading and adjust the conditions.')
  })

  it('answers the top alert that evaluateAlerts finds', () => {
    const p = plants.find((x) => x.plant_type_id === 'panda_plant')!
    const [top] = evaluateAlerts(p, { soil_moisture: 2, temp_c: 22, rh_pct: 40 }, new Set())
    expect(adviceFor(p, top)).toBe('Water thoroughly until water drains, then empty the saucer.')
  })
})
