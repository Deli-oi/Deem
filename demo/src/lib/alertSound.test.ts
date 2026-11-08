import { describe, expect, it, vi } from 'vitest'
import { ALERT_PATTERN_HZ, alertDurationMs, playAlert, soundEnabled } from './alertSound'
import type { AudioLike } from './alertSound'

function fakeContext(state = 'running') {
  const oscillators: Array<{ hz: number[]; start: number; stop: number }> = []
  const ctx: AudioLike = {
    currentTime: 1,
    state,
    destination: {},
    resume: vi.fn(async () => {}),
    createOscillator: () => {
      const rec = { hz: [] as number[], start: -1, stop: -1 }
      oscillators.push(rec)
      return {
        type: '',
        frequency: { setValueAtTime: (v: number) => void rec.hz.push(v) },
        connect: () => {},
        start: (t: number) => void (rec.start = t),
        stop: (t: number) => void (rec.stop = t),
      }
    },
    createGain: () => ({ gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {} }),
  }
  return { ctx, oscillators }
}

describe('playAlert', () => {
  it('schedules the alternating beeps back to back', () => {
    const { ctx, oscillators } = fakeContext()
    expect(playAlert(ctx)).toBe(true)
    expect(oscillators.map((o) => o.hz[0])).toEqual(ALERT_PATTERN_HZ)
    for (let i = 1; i < oscillators.length; i++) expect(oscillators[i].start).toBeGreaterThan(oscillators[i - 1].stop)
    expect(oscillators.every((o) => o.stop > o.start)).toBe(true)
  })

  it('resumes a suspended context (browser autoplay rules)', () => {
    const { ctx } = fakeContext('suspended')
    playAlert(ctx)
    expect(ctx.resume).toHaveBeenCalled()
  })

  it('returns false when there is no audio', () => {
    expect(playAlert(null)).toBe(false)
  })

  it('lasts about a second', () => {
    expect(alertDurationMs()).toBeGreaterThan(900)
    expect(alertDurationMs()).toBeLessThan(1500)
  })
})

describe('soundEnabled', () => {
  it('is off only with ?silent', () => {
    expect(soundEnabled('')).toBe(true)
    expect(soundEnabled('?kiosk')).toBe(true)
    expect(soundEnabled('?silent')).toBe(false)
    expect(soundEnabled('?kiosk&silent')).toBe(false)
  })
})
