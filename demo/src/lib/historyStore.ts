import type { DailyHealth } from './types'

type Bucket = { sum: number; n: number }
type Stored = Record<string, Bucket>

const KEY = 'deem.dailyHealth.v1'
const MAX_DAYS = 14

function localDate(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * One point per day = average of that day's overall health scores
 * (project decision). Kept in localStorage so it survives a reload.
 * Storage may be missing or throw (private mode), so every access is guarded.
 */
export class DailyHealthStore {
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
    const date = localDate(tsSeconds)
    const b = this.data[date] ?? { sum: 0, n: 0 }
    this.data[date] = { sum: b.sum + score, n: b.n + 1 }
    this.trim()
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.data))
    } catch {
      // storage full or blocked: history still works for this session
    }
  }

  days(): DailyHealth[] {
    return Object.keys(this.data)
      .sort()
      .map((date) => ({ date, avg_health: Math.round(this.data[date].sum / this.data[date].n) }))
  }

  private trim() {
    const dates = Object.keys(this.data).sort()
    for (const d of dates.slice(0, Math.max(0, dates.length - MAX_DAYS))) delete this.data[d]
  }
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
