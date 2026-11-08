import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The voice service is replaced by canned phrases (no microphone, no Fish Audio).
vi.mock('./voice', async () => {
  const { FakeVoice } = await import('./lib/voice')
  // one phrase per recording: the first belongs to the accidental short tap, which is thrown away
  return { voice: new FakeVoice(['(thrown away)', 'dracaena', 'is the air ok?']) }
})

import App from './App'

const seedText = readFileSync('public/plants/seed_all.json', 'utf8')
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mic = (name: RegExp) => screen.getByRole('button', { name })

beforeEach(() => {
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => JSON.parse(seedText) }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('voice button: tap to turn the mic on, tap again to turn it off', () => {
  it('sets up a plant by voice, then asks a question by voice, all with taps on the screen', async () => {
    const { container } = render(<App />)

    // Setup: the mic button is on screen and the screen is made shorter to leave room for it.
    await screen.findByText('Tap the mic and say your plant.', {}, { timeout: 3000 })
    expect(container.querySelector('.screen.has-mic')).toBeTruthy()
    expect(mic(/turn the microphone on/i)).toBeTruthy()

    // An accidental double tap is ignored with a hint, not sent.
    fireEvent.click(mic(/turn the microphone on/i))
    await screen.findByText(/Listening/)
    fireEvent.click(mic(/turn the microphone off/i))
    await screen.findByText('Tap the mic, speak, then tap it again.')

    // Tap on, say it, tap off: the plant is heard and matched.
    fireEvent.click(mic(/turn the microphone on/i))
    const off = await screen.findByRole('button', { name: /turn the microphone off/i })
    expect(off.getAttribute('aria-pressed')).toBe('true')
    await wait(450)
    fireEvent.click(off)
    await screen.findByText('Confirm?', {}, { timeout: 3000 })
    expect(screen.getByText(/Heard: "dracaena"/)).toBeTruthy()
    expect(container.querySelector('.mic-bar')).toBeNull() // not needed on the confirm step

    // Confirm on screen, wait for the sensors, and land on the live screen with the mic still there.
    await wait(450) // CONFIRM is held off for a moment so a double tap cannot skip the check
    fireEvent.click(screen.getByText('CONFIRM'))
    await waitFor(() => expect(container.querySelector('.health-activity, .failure-page')).toBeTruthy(), { timeout: 8000 })
    expect(container.querySelector('.screen.has-mic')).toBeTruthy()

    // Live: tap on, tap off, and the question is answered on screen.
    fireEvent.click(mic(/turn the microphone on/i))
    const liveOff = await screen.findByRole('button', { name: /turn the microphone off/i })
    await wait(450)
    fireEvent.click(liveOff)
    await screen.findByText('"is the air ok?"', {}, { timeout: 3000 })
    expect(container.querySelector('.ask-sheet')).toBeTruthy()
  }, 30_000)

  it('has no physical-key shortcuts for the mic or for a test reading any more', async () => {
    render(<App />)
    await screen.findByText('Tap the mic and say your plant.', {}, { timeout: 3000 })
    fireEvent.keyDown(window, { code: 'KeyM' })
    await wait(50)
    expect(screen.queryByText(/Listening/)).toBeNull()
  })
})
