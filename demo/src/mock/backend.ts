import { matchPlantLocal } from '../lib/matchPlant'
import { scoreHealth, withHealth } from '../lib/healthScore'
import type {
  AskAnswer,
  DailyHealth,
  PlantMatch,
  PlantType,
  Telemetry,
} from '../lib/types'

import healthy from './fixtures/dracaena/healthy.json'
import drySoil from './fixtures/dracaena/dry_soil.json'
import highCo2 from './fixtures/dracaena/high_co2.json'
import coldSnap from './fixtures/dracaena/cold_snap.json'
import overwatered from './fixtures/dracaena/overwatered.json'
import historyDaily from './fixtures/dracaena/history_daily.json'

/**
 * Backend contract. MockBackend is the local stand-in.
 * Later: RailwayBackend / AtlasGeminiBackend implementing the same methods.
 */
export interface DeemBackend {
  listPlants(): Promise<PlantType[]>
  matchPlant(utterance: string): Promise<PlantMatch | null>
  getLatestTelemetry(plantTypeId: string): Promise<Telemetry>
  collectNow(plantTypeId: string): Promise<Telemetry>
  advanceFixture(plantTypeId: string): Promise<Telemetry>
  setFixture(plantTypeId: string, index: number): Promise<Telemetry>
  getHistory(plantTypeId: string): Promise<DailyHealth[]>
  ask(plantTypeId: string, question: string): Promise<AskAnswer>
  listFixtureLabels(plantTypeId: string): string[]
  getFixtureIndex(): number
}

const FIXTURE_CYCLE: Telemetry[] = [
  healthy as Telemetry,
  drySoil as Telemetry,
  highCo2 as Telemetry,
  coldSnap as Telemetry,
  overwatered as Telemetry,
]

export class MockBackend implements DeemBackend {
  private plants: PlantType[] = []
  private fixtureIndex = 0
  private loaded = false

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

  async getLatestTelemetry(plantTypeId: string): Promise<Telemetry> {
    await this.ensurePlants()
    const plant = this.plantOrThrow(plantTypeId)
    const raw = FIXTURE_CYCLE[this.fixtureIndex % FIXTURE_CYCLE.length]
    return withHealth({ ...raw, ts: Math.floor(Date.now() / 1000) }, plant)
  }

  async collectNow(plantTypeId: string): Promise<Telemetry> {
    return this.getLatestTelemetry(plantTypeId)
  }

  async advanceFixture(plantTypeId: string): Promise<Telemetry> {
    this.fixtureIndex = (this.fixtureIndex + 1) % FIXTURE_CYCLE.length
    return this.getLatestTelemetry(plantTypeId)
  }

  async setFixture(plantTypeId: string, index: number): Promise<Telemetry> {
    this.fixtureIndex = ((index % FIXTURE_CYCLE.length) + FIXTURE_CYCLE.length) % FIXTURE_CYCLE.length
    return this.getLatestTelemetry(plantTypeId)
  }

  getFixtureIndex(): number {
    return this.fixtureIndex
  }

  async getHistory(plantTypeId: string): Promise<DailyHealth[]> {
    await this.ensurePlants()
    this.plantOrThrow(plantTypeId)
    if (plantTypeId === 'dracaena') return historyDaily.days as DailyHealth[]
    // synthetic history for other plants in the mock
    return historyDaily.days.map((d, i) => ({
      ...d,
      avg_health: clamp(d.avg_health - 4 + ((i * 3) % 9), 40, 98),
    }))
  }

  async ask(plantTypeId: string, question: string): Promise<AskAnswer> {
    await this.ensurePlants()
    const plant = this.plantOrThrow(plantTypeId)
    const telemetry = await this.getLatestTelemetry(plantTypeId)
    await delay(400)

    const m = telemetry.metrics
    const hits = plant.solutions.filter((s) => {
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

  listFixtureLabels(plantTypeId: string): string[] {
    void plantTypeId
    return FIXTURE_CYCLE.map((f) => f.label ?? f.id ?? 'fixture')
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/** Singleton used by the UI. Replace this export when wiring Railway/Atlas. */
export const backend: DeemBackend = new MockBackend()
