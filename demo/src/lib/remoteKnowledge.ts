import type { DeemBackend } from './backendTypes'
import type { AskAnswer, PlantMatch, PlantType, Telemetry } from './types'

type Knowledge = Pick<DeemBackend, 'listPlants' | 'matchPlant' | 'ask'>

/**
 * Plant knowledge from the hosted Deem server (plants in the Tiger database, matching and answers by
 * Gemini). If the server is slow, offline or errors, every call quietly uses `fallback` (the local
 * matcher and canned answers), so setup and questions still work with no internet.
 */
export class RemoteKnowledge implements Knowledge {
  private readonly base: string
  private readonly fallback: Knowledge
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private plants: PlantType[] | null = null

  constructor(opts: { base: string; fallback: Knowledge; fetchImpl?: typeof fetch; timeoutMs?: number }) {
    this.base = opts.base.replace(/\/+$/, '')
    this.fallback = opts.fallback
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a))
    this.timeoutMs = opts.timeoutMs ?? 8000
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      })
      if (!res.ok) throw new Error(`server ${res.status}`)
      return (await res.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }

  async listPlants(): Promise<PlantType[]> {
    if (this.plants) return this.plants
    try {
      const { plants } = await this.call<{ plants: PlantType[] }>('/api/plants')
      if (Array.isArray(plants) && plants.length > 0) {
        this.plants = plants
        return plants
      }
    } catch {
      // fall through to the local list
    }
    return this.fallback.listPlants()
  }

  async matchPlant(utterance: string): Promise<PlantMatch | null> {
    try {
      const { match } = await this.call<{ match: { plant_type_id: string; confidence: number } | null }>('/api/plants/match', { utterance })
      if (match === null) return null // Gemini heard it and found no plant like that
      const plant = (await this.listPlants()).find((p) => p.plant_type_id === match.plant_type_id)
      if (plant) return { plant, confidence: match.confidence, utterance }
    } catch {
      // fall through to the local matcher
    }
    return this.fallback.matchPlant(utterance)
  }

  async ask(plantTypeId: string, question: string, telemetry?: Telemetry): Promise<AskAnswer> {
    try {
      const out = await this.call<AskAnswer>('/api/ask', {
        plant_type_id: plantTypeId,
        question,
        metrics: telemetry?.metrics ?? {},
        health_score: telemetry?.health_score,
      })
      if (typeof out.answer === 'string' && out.answer) {
        return { question, answer: out.answer, based_on: Array.isArray(out.based_on) ? out.based_on : [] }
      }
    } catch {
      // fall through to the canned answer
    }
    return this.fallback.ask(plantTypeId, question, telemetry)
  }
}
