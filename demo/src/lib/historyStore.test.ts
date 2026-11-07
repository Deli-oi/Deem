import { describe, expect, it } from 'vitest'
import { HourlyHealthStore, hourKey } from './historyStore'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

// Local time (not UTC) so the hour bucket is stable in any timezone.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime() / 1000

describe('HourlyHealthStore', () => {
  it('averages the scores within an hour', () => {
    const store = new HourlyHealthStore(memory())
    store.add(at(1, 9, 5), 80)
    store.add(at(1, 9, 50), 60)
    store.add(at(1, 10, 1), 90)
    expect(store.hours()).toEqual([
      { hour: '2026-11-01 09', avg_health: 70 },
      { hour: '2026-11-01 10', avg_health: 90 },
    ])
  })

  it('keeps hours in order across midnight', () => {
    const store = new HourlyHealthStore(null)
    store.add(at(2, 0, 10), 50)
    store.add(at(1, 23, 10), 60)
    expect(store.hours().map((h) => h.hour)).toEqual(['2026-11-01 23', '2026-11-02 00'])
  })

  it('keeps only the last 24 hours', () => {
    const store = new HourlyHealthStore(null)
    // Raw 3600s steps (not wall-clock hours) so this also holds across a DST change.
    const start = at(1, 0)
    for (let h = 0; h < 30; h++) store.add(start + h * 3600, 70)
    expect(store.hours()).toHaveLength(24)
    expect(store.hours()[0].hour).toBe(hourKey(start + 6 * 3600))
  })

  it('survives a reload', () => {
    const storage = memory()
    new HourlyHealthStore(storage).add(at(3, 14), 75)
    expect(new HourlyHealthStore(storage).hours()).toEqual([{ hour: '2026-11-03 14', avg_health: 75 }])
  })

  it('works without storage', () => {
    const store = new HourlyHealthStore(null)
    store.add(at(4, 8), 50)
    expect(store.hours()).toHaveLength(1)
  })
})
