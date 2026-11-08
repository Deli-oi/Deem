import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./voice', async () => {
  const { FakeVoice } = await import('./lib/voice')
  return { voice: new FakeVoice(['dracaena']) }
})

// The cloud session is replaced by a recorder: we only check WHEN the screen starts and stops collection.
const events: string[] = []
vi.mock('./session', () => ({
  session: {
    start: (plant: string) => events.push(`start:${plant}`),
    stop: async () => {
      events.push('stop')
    },
  },
}))

import App from './App'

const seedText = readFileSync('public/plants/seed_all.json', 'utf8')
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  events.length = 0
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => JSON.parse(seedText) }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('data collection starts when setup finishes and ends with STOP', () => {
  it('starts nothing during setup, starts on the live screen, and STOP (asked twice) goes back to setup', async () => {
    const { container } = render(<App />)
    await screen.findByText('Tap the mic and say your plant.', {}, { timeout: 3000 })
    expect(events).toEqual([]) // nothing is collected while setting up

    fireEvent.click(screen.getByRole('button', { name: /turn the microphone on/i }))
    const off = await screen.findByRole('button', { name: /turn the microphone off/i })
    await wait(450)
    fireEvent.click(off)
    await screen.findByText('Confirm?', {}, { timeout: 3000 })
    expect(events).toEqual([]) // a plant is heard but not confirmed yet

    await wait(450) // CONFIRM is held off for a moment
    fireEvent.click(screen.getByText('CONFIRM'))
    await waitFor(() => expect(container.querySelector('.health-activity, .failure-page')).toBeTruthy(), { timeout: 8000 })
    expect(events).toEqual(['start:dracaena']) // every sensor passed, plant confirmed: collection starts

    // STOP lives on the history page (the third page), asked twice
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    const stop = await screen.findByRole('button', { name: /stop data collection/i })
    expect(stop.textContent).toContain('STOP COLLECTING')
    fireEvent.click(stop)
    expect(events).toEqual(['start:dracaena']) // one touch only asks
    fireEvent.click(await screen.findByRole('button', { name: /tap again to end/i }))

    await screen.findByText('Tap the mic and say your plant.', {}, { timeout: 3000 })
    expect(events).toEqual(['start:dracaena', 'stop'])
    expect(container.querySelector('.health-activity')).toBeNull()
    expect(screen.getByRole('button', { name: /turn the microphone on/i })).toBeTruthy() // ready to set up again
  }, 30_000)
})
