import { describe, expect, it, vi } from 'vitest'
import type { AskAnswer, PlantMatch, PlantType, Telemetry } from './types'
import { RemoteKnowledge } from './remoteKnowledge'

const plant = (id: string) => ({ plant_type_id: id, common_names: [id], scientific_name: id, thresholds: {}, care: {}, solutions: [] }) as unknown as PlantType
const PLANTS = [plant('dracaena'), plant('panda_plant')]

const fallback = {
  listPlants: vi.fn(async () => [plant('local_only')]),
  matchPlant: vi.fn(async (u: string): Promise<PlantMatch | null> => ({ plant: plant('local_only'), confidence: 0.6, utterance: u })),
  ask: vi.fn(async (_id: string, q: string): Promise<AskAnswer> => ({ question: q, answer: 'canned', based_on: [] })),
}

const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
const tel = { metrics: { soil_moisture: 9, temp_c: 22 }, health_score: 70 } as unknown as Telemetry

function make(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchImpl = vi.fn(async (u: RequestInfo | URL, i?: RequestInit) => handler(String(u), i))
  const k = new RemoteKnowledge({ base: 'https://api.example/', fallback, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 200 })
  return { k, fetchImpl }
}

describe('RemoteKnowledge', () => {
  it('uses the server plants and the plant Gemini picked', async () => {
    const { k, fetchImpl } = make((url) =>
      url.endsWith('/api/plants') ? reply({ plants: PLANTS }) : reply({ match: { plant_type_id: 'panda_plant', confidence: 0.91 } }),
    )
    const m = await k.matchPlant('panda')
    expect(m?.plant.plant_type_id).toBe('panda_plant')
    expect(m?.confidence).toBe(0.91)
    expect(m?.utterance).toBe('panda')
    expect(await k.listPlants()).toBe(PLANTS)
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toContain('https://api.example/api/plants/match')
  })

  it('"no plant like that" from the server is a real no-match, not a fallback', async () => {
    fallback.matchPlant.mockClear()
    const { k } = make((url) => (url.endsWith('/api/plants') ? reply({ plants: PLANTS }) : reply({ match: null })))
    expect(await k.matchPlant('my cactus')).toBeNull()
    expect(fallback.matchPlant).not.toHaveBeenCalled()
  })

  it('falls back to the local matcher and list when the server is down, errors, or is too slow', async () => {
    fallback.matchPlant.mockClear()
    const down = make(() => { throw new Error('offline') })
    expect((await down.k.matchPlant('pothos'))?.plant.plant_type_id).toBe('local_only')
    expect((await down.k.listPlants())[0].plant_type_id).toBe('local_only')
    const err = make(() => reply({ error: 'x' }, 502))
    expect((await err.k.matchPlant('pothos'))?.plant.plant_type_id).toBe('local_only')
    const slow = make((_u, init) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))))
    expect((await slow.k.matchPlant('pothos'))?.plant.plant_type_id).toBe('local_only')
  })

  it('falls back when the server names a plant it did not list', async () => {
    const { k } = make((url) => (url.endsWith('/api/plants') ? reply({ plants: PLANTS }) : reply({ match: { plant_type_id: 'ghost', confidence: 0.9 } })))
    expect((await k.matchPlant('ghost'))?.plant.plant_type_id).toBe('local_only')
  })

  it('sends the live readings with a question and shows the answer', async () => {
    const { k, fetchImpl } = make(() => reply({ question: 'q', answer: 'Water it soon.', based_on: ['soil_moisture=9'] }))
    const out = await k.ask('dracaena', 'should I water?', tel)
    expect(out).toEqual({ question: 'should I water?', answer: 'Water it soon.', based_on: ['soil_moisture=9'] })
    const sent = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))
    expect(sent).toMatchObject({ plant_type_id: 'dracaena', metrics: { soil_moisture: 9, temp_c: 22 }, health_score: 70 })
  })

  it('uses the canned answer when the server cannot answer', async () => {
    const { k } = make(() => reply({ error: 'x' }, 502))
    expect((await k.ask('dracaena', 'hi', tel)).answer).toBe('canned')
    const blank = make(() => reply({ answer: '' }))
    expect((await blank.k.ask('dracaena', 'hi', tel)).answer).toBe('canned')
  })
})
