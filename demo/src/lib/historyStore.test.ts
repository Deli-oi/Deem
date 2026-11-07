import { describe, expect, it } from 'vitest'
import { DailyHealthStore } from './historyStore'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

// Local noon, so the local calendar date is stable in any timezone.
const day = (d: number) => new Date(2026, 10, d, 12).getTime() / 1000

describe('DailyHealthStore', () => {
  it('averages the scores within a day', () => {
    const store = new DailyHealthStore(memory())
    store.add(day(1), 80)
    store.add(day(1), 60)
    store.add(day(2), 90)
    expect(store.days()).toEqual([
      { date: '2026-11-01', avg_health: 70 },
      { date: '2026-11-02', avg_health: 90 },
    ])
  })

  it('survives a reload', () => {
    const storage = memory()
    new DailyHealthStore(storage).add(day(3), 75)
    expect(new DailyHealthStore(storage).days()).toEqual([{ date: '2026-11-03', avg_health: 75 }])
  })

  it('works without storage', () => {
    const store = new DailyHealthStore(null)
    store.add(day(4), 50)
    expect(store.days()).toHaveLength(1)
  })
})
