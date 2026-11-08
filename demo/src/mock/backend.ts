import { matchPlantLocal } from '../lib/matchPlant'
import { scoreHealth, withHealth } from '../lib/healthScore'
import { AIR_QUALITY_SOLUTIONS } from '../lib/airQuality'
import { hourKey } from '../lib/historyStore'
import type { BackendEvent, DeemBackend } from '../lib/backendTypes'
import { SENSORS } from '../lib/telemetry'
import type { SensorProgress } from '../lib/telemetry'
import type {
  AskAnswer,
  HealthPoint,
  PlantMatch,
  PlantType,
  Telemetry,
} from '../lib/types'

import healthy from './fixtures/dracaena/healthy.json'
import drySoil from './fixtures/dracaena/dry_soil.json'
import highCo2 from './fixtures/dracaena/high_co2.json'
import coldSnap from './fixtures/dracaena/cold_snap.json'
import overwatered from './fixtures/dracaena/overwatered.json'
import tooHot from './fixtures/dracaena/too_hot.json'
import dryAir from './fixtures/dracaena/dry_air.json'
import humidAir from './fixtures/dracaena/humid_air.json'
import dustyPm25 from './fixtures/dracaena/dusty_pm25.json'
import dustyPm10 from './fixtures/dracaena/dusty_pm10.json'
import historyDaily from './fixtures/dracaena/history_daily.json'

export const FIXTURE_CYCLE: Telemetry[] = [
  healthy as Telemetry,
  drySoil as Telemetry,
  overwatered as Telemetry,
  coldSnap as Telemetry,
  tooHot as Telemetry,
  dryAir as Telemetry,
  humidAir as Telemetry,
  highCo2 as Telemetry,
  dustyPm25 as Telemetry,
  dustyPm10 as Telemetry,
]

/** The ids of the readings the mock can show (healthy plus the nine failures), for `?scenario=<id>`. */
export const SCENARIO_IDS = FIXTURE_CYCLE.map((f) => f.id as string)

/**
 * Fixture-driven stand-in. Used for local UI work when no ESP32 is attached.
 * `scenario` picks which reading it shows (default `healthy`): open the app with `?scenario=dry_soil`
 * to see that failure. See SCENARIO_IDS.
 */
export class MockBackend implements DeemBackend {
  private plants: PlantType[] = []
  private fixtureIndex = 0
  private loaded = false

  constructor(opts: { scenario?: string | null } = {}) {
    const i = FIXTURE_CYCLE.findIndex((f) => f.id === opts.scenario)
    if (i !== -1) this.fixtureIndex = i
  }

  private async ensurePlants() {
    if (this.loaded) return
    const res = await fetch('/plants/seed_all.json')
    if (!res.ok) throw new Error(`Failed to load plant seed data: ${res.status}`)
    this.plants = (await res.json()) as PlantType[]
    this.loaded = true
  }

  private plantOrThrow(plantTypeId: string) {
    const plant = this.plants.find((p) => p.plant_type_id === plantTypeId)
    if (!plant) throw new Error(`Unknown plant_type_id: ${plantTypeId}`)
    return plant
  }

  async listPlants(): Promise<PlantType[]> {
    await this.ensurePlants()
    return this.plants
  }

  async matchPlant(utterance: string): Promise<PlantMatch | null> {
    await this.ensurePlants()
    // Simulate network / model latency for the demo
    await delay(350)
    return matchPlantLocal(utterance, this.plants)
  }

  selectPlant(plant: PlantType): void {
    void plant
  }

  /** Simulates the real device: sensors come up one after another, in the firmware's init order. */
  async checkSensors(onProgress: (progress: SensorProgress[]) => void): Promise<SensorProgress[]> {
    const state = SENSORS.map((s) => ({ id: s.id, name: s.name, state: 'pending' as SensorProgress['state'] }))
    onProgress(state.map((s) => ({ ...s })))
    for (const s of state) {
      await delay(450)
      s.state = 'ok'
      onProgress(state.map((x) => ({ ...x })))
    }
    return state
  }

  subscribe(listener: (event: BackendEvent) => void): () => void {
    void listener
    return () => {}
  }

  async getLatestTelemetry(plantTypeId: string): Promise<Telemetry> {
    await this.ensurePlants()
    const plant = this.plantOrThrow(plantTypeId)
    const raw = FIXTURE_CYCLE[this.fixtureIndex % FIXTURE_CYCLE.length]
    return withHealth({ ...raw, ts: Math.floor(Date.now() / 1000) }, plant)
  }

  async getHistory(plantTypeId: string): Promise<HealthPoint[]> {
    await this.ensurePlants()
    this.plantOrThrow(plantTypeId)
    // Fixture values stand in for the last N hourly averages, ending at the current hour.
    const values = historyDaily.days.map((d) => d.avg_health)
    const nowHour = Math.floor(Date.now() / 3_600_000)
    return values.map((v, i) => ({
      hour: hourKey((nowHour - (values.length - 1 - i)) * 3600),
      avg_health: plantTypeId === 'dracaena' ? v : clamp(v - 4 + ((i * 3) % 9), 40, 98),
    }))
  }

  async ask(plantTypeId: string, question: string, live?: Telemetry): Promise<AskAnswer> {
    await this.ensurePlants()
    const plant = this.plantOrThrow(plantTypeId)
    const telemetry = live ?? (await this.getLatestTelemetry(plantTypeId))
    await delay(400)

    const m = telemetry.metrics
    const hits = [...plant.solutions, ...AIR_QUALITY_SOLUTIONS].filter((s) => {
      const t = s.trigger
      if (!t) return false
      const value = (m as Record<string, number>)[t.metric]
      if (value == null) return false
      if (t.op === '<' && value < t.value) return true
      if (t.op === '>' && value > t.value) return true
      return false
    })

    const based_on = [
      `latest health ${telemetry.health_score ?? scoreHealth(m, plant)}`,
      `soil_moisture=${m.soil_moisture}`,
      `temp_c=${m.temp_c}`,
      `rh_pct=${m.rh_pct}`,
      `co2_ppm=${m.co2_ppm}`,
    ]

    if (hits.length > 0) {
      return {
        question,
        answer: hits.map((h) => h.advice).join(' '),
        based_on: [...based_on, ...hits.map((h) => h.problem)],
      }
    }

    const q = question.toLowerCase()
    if (q.includes('water')) {
      return {
        question,
        answer: plant.care.watering || 'Water when the soil surface dries; avoid leaving the pot sitting in water.',
        based_on,
      }
    }
    if (q.includes('light') || q.includes('sun')) {
      return {
        question,
        answer: plant.care.sunlight || 'Give bright, indirect light and avoid harsh midday sun.',
        based_on,
      }
    }

    return {
      question,
      answer: `${plant.common_names[0]} looks ${
        (telemetry.health_score ?? 0) >= 70 ? 'generally okay' : 'like it needs attention'
      } right now. Soil moisture is ${m.soil_moisture}, temp ${m.temp_c}°C, humidity ${m.rh_pct}%. ${
        plant.care.watering
      }`,
      based_on,
    }
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}
