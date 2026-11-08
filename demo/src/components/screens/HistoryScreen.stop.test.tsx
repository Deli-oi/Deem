import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlantType } from '../../lib/types'
import { HistoryScreen } from './HistoryScreen'

const plant = { plant_type_id: 'dracaena', common_names: ['Dracaena'], scientific_name: 'Dracaena', sprite_ref: '', thresholds: {}, care: {}, solutions: [] } as unknown as PlantType
const points = [{ hour: '2026-11-08 09', avg_health: 80 }]

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('STOP COLLECTING on the history page', () => {
  it('takes two touches, so a stray tap cannot end collection', () => {
    const onStop = vi.fn()
    render(<HistoryScreen plant={plant} points={points} onStop={onStop} />)
    fireEvent.click(screen.getByRole('button', { name: /stop data collection/i }))
    expect(onStop).not.toHaveBeenCalled()
    expect(screen.getByText(/TAP AGAIN TO END/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /tap again to end/i }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('goes back to the quiet state after 4 seconds without a second touch', () => {
    const onStop = vi.fn()
    render(<HistoryScreen plant={plant} points={points} onStop={onStop} />)
    fireEvent.click(screen.getByRole('button', { name: /stop data collection/i }))
    act(() => {
      vi.advanceTimersByTime(4100)
    })
    expect(screen.getByText(/STOP COLLECTING/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /stop data collection/i }))
    expect(onStop).not.toHaveBeenCalled() // it is a fresh first touch again
  })

  it('shows no button when nothing can be stopped (no handler)', () => {
    render(<HistoryScreen plant={plant} points={points} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
