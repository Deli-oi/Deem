import type { HealthPoint } from './types'

type Bucket = { sum: number; n: number }
type Stored = Record<string, Bucket>

const KEY = 'deem.hourlyHealth.v1'
const MAX_HOURS = 24

/** Local-time hour bucket key, e.g. "2026-11-07 16". Sorts correctly as a string. */
export function hourKey(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd} ${hh}`
}

/**
 * One point per hour = average of that hour's overall health scores
 * (project decision). Keeps the last 24 hours in localStorage so it survives a
 * reload. Storage may be missing or throw (private mode), so every access is guarded.
 */
export class HourlyHealthStore {
  private data: Stored = {}
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null
  private key: string

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(), key: string = KEY) {
    this.storage = storage
    this.key = key
    try {
      const raw = this.storage?.getItem(this.key)
      if (raw) this.data = JSON.parse(raw) as Stored
    } catch {
      this.data = {}
    }
  }

  add(tsSeconds: number, score: number) {
    const hour = hourKey(tsSeconds)
    const b = this.data[hour] ?? { sum: 0, n: 0 }
    this.data[hour] = { sum: b.sum + score, n: b.n + 1 }
    this.trim()
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.data))
    } catch {
      // storage full or blocked: history still works for this session
    }
  }

  hours(): HealthPoint[] {
    return Object.keys(this.data)
      .sort()
      .map((hour) => ({ hour, avg_health: Math.round(this.data[hour].sum / this.data[hour].n) }))
  }

  private trim() {
    const keys = Object.keys(this.data).sort()
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_HOURS))) delete this.data[k]
  }
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
