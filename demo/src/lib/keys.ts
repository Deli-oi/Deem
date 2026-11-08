/**
 * The device's two physical keys (mechanical keyboard). They are NOT on the screen.
 * `KeyboardEvent.code` is the physical key position, so it works on any layout.
 *
 *   MIC  hold to talk, release to send (Fish Audio speech-to-text)
 *   TEST press to take a test input now
 *
 * Change the two codes here to remap to the actual keys on the board
 * (e.g. 'F13', 'Numpad0', 'Space').
 */
export const KEYS = {
  mic: 'KeyM',
  test: 'KeyT',
} as const

export type HardwareKey = keyof typeof KEYS

export function hardwareKeyFor(code: string): HardwareKey | null {
  if (code === KEYS.mic) return 'mic'
  if (code === KEYS.test) return 'test'
  return null
}
