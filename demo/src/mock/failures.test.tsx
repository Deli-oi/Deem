import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FailureScreen } from '../components/screens/FailureScreen'
import { evaluateAlerts } from '../lib/alerts'
import { adviceFor, firstSentence } from '../lib/advice'
import { AIR_QUALITY_SOLUTIONS } from '../lib/airQuality'
import type { PlantType, Telemetry } from '../lib/types'
import { FIXTURE_CYCLE, MockBackend } from './backend'

const seedText = readFileSync('public/plants/seed_all.json', 'utf8')
const dracaena = (JSON.parse(seedText) as PlantType[]).find((p) => p.plant_type_id === 'dracaena')!

const FAILURES = [
  { fixture: 'dry_soil', metric: 'soil_moisture', direction: 'low', label: 'Soil critically dry' },
  { fixture: 'overwatered', metric: 'soil_moisture', direction: 'high', label: 'Soil critically wet' },
  { fixture: 'cold_snap', metric: 'temp_c', direction: 'low', label: 'Critically cold' },
  { fixture: 'too_hot', metric: 'temp_c', direction: 'high', label: 'Critically hot' },
  { fixture: 'dry_air', metric: 'rh_pct', direction: 'low', label: 'Air critically dry' },
  { fixture: 'humid_air', metric: 'rh_pct', direction: 'high', label: 'Air critically humid' },
  { fixture: 'high_co2', metric: 'co2_ppm', direction: 'high', label: 'CO2 critically high' },
  { fixture: 'dusty_pm25', metric: 'pm2_5', direction: 'high', label: 'Fine dust critically high' },
  { fixture: 'dusty_pm10', metric: 'pm10_0', direction: 'high', label: 'Dust critically high' },
] as const

const byId = (id: string) => FIXTURE_CYCLE.find((f) => f.id === id) as Telemetry

describe('failure fixtures', () => {
  it('healthy produces no alerts', () => {
    expect(evaluateAlerts(dracaena, byId('healthy').metrics, new Set())).toEqual([])
  })

  it.each(FAILURES)('$fixture: $label', ({ fixture, metric, direction, label }) => {
    const telemetry = byId(fixture)
    const alerts = evaluateAlerts(dracaena, telemetry.metrics, new Set())
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ metric, direction, label })

    const { container, getByText } = render(
      <FailureScreen plant={dracaena} telemetry={telemetry} alerts={alerts} />,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/sprites/wilted/dracaena.png')
    expect(container.querySelector('.failure-label')?.textContent).toBe(label)
    const advice = adviceFor(dracaena, alerts[0])
    expect(container.querySelectorAll('.failure-advice')).toHaveLength(1)
    expect(getByText(advice)).toBeTruthy()

    const op = direction === 'low' ? '<' : '>'
    const stored = [...dracaena.solutions, ...AIR_QUALITY_SOLUTIONS].find(
      (s) => s.trigger?.metric === metric && s.trigger.op === op,
    )
    expect(stored).toBeTruthy()
    expect(advice).toBe(firstSentence(stored!.advice))
  })
})

describe('TEST key cycle', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => JSON.parse(seedText) }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('visits healthy then all 9 failures once, in order, then wraps', async () => {
    const backend = new MockBackend()
    const seen: string[][] = []
    const read = (t: Telemetry) =>
      seen.push(evaluateAlerts(dracaena, t.metrics, new Set()).map((a) => a.label))
    read(await backend.getLatestTelemetry('dracaena'))
    for (let i = 0; i < 9; i++) read(await backend.collectNow('dracaena'))
    expect(seen).toEqual([[], ...FAILURES.map((f) => [f.label])])
    read(await backend.collectNow('dracaena'))
    expect(seen[10]).toEqual([])
  })
})
