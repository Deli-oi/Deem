/**
 * The alert noise: three alternating beeps, generated with Web Audio (no audio file to ship).
 * It plays through the browser's default output, i.e. the USB speaker on the Pi.
 *
 * Browsers only allow sound after a user gesture. The first key press or touch unlocks it
 * (`unlockAudio`). A kiosk Chromium can skip that with
 * `--autoplay-policy=no-user-gesture-required`.
 */

/** The small slice of Web Audio we use, so tests can inject a fake. */
export interface AudioLike {
  currentTime: number
  state: string
  destination: unknown
  resume(): Promise<void>
  createOscillator(): {
    type: string
    frequency: { setValueAtTime(v: number, t: number): void }
    connect(n: unknown): void
    start(t: number): void
    stop(t: number): void
  }
  createGain(): {
    gain: { setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void }
    connect(n: unknown): void
  }
}

/** Alternating high/low tones, each BEEP_S long with a short gap. */
export const ALERT_PATTERN_HZ = [880, 660, 880, 660, 880]
const BEEP_S = 0.16
const GAP_S = 0.07
const VOLUME = 0.25

export function alertDurationMs(): number {
  return Math.round(ALERT_PATTERN_HZ.length * (BEEP_S + GAP_S) * 1000)
}

let shared: AudioLike | null = null

function context(): AudioLike | null {
  if (shared) return shared
  const Ctor = (window as unknown as { AudioContext?: new () => AudioLike; webkitAudioContext?: new () => AudioLike }).AudioContext
  if (!Ctor) return null
  shared = new Ctor()
  return shared
}

/** Call from a user gesture (key/touch) so later alerts are allowed to play. */
export function unlockAudio() {
  const ctx = context()
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {})
}

/** Plays the alert once. Returns false if sound is unavailable (the on-screen alert still shows). */
export function playAlert(ctx: AudioLike | null = context()): boolean {
  if (!ctx) return false
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  let t = ctx.currentTime + 0.02
  for (const hz of ALERT_PATTERN_HZ) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square' // harsh and retro, easy to notice
    osc.frequency.setValueAtTime(hz, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(VOLUME, t + 0.01)
    gain.gain.setValueAtTime(VOLUME, t + BEEP_S - 0.02)
    gain.gain.linearRampToValueAtTime(0, t + BEEP_S)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + BEEP_S)
    t += BEEP_S + GAP_S
  }
  return true
}

/** `?silent` turns the sound off (e.g. while rehearsing or developing). */
export function soundEnabled(search: string = window.location.search): boolean {
  return !new URLSearchParams(search).has('silent')
}
