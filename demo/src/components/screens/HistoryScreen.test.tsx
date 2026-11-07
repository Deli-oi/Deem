import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlantType } from '../../lib/types'
import { HistoryScreen, hourLabel } from './HistoryScreen'

const plant = { plant_type_id: 'dracaena', common_names: ['Dracaena'] } as PlantType

afterEach(cleanup)

describe('hourLabel', () => {
  it('formats a 24h hour key as 12h', () => {
    expect(hourLabel('2026-11-07 00')).toBe('12A')
    expect(hourLabel('2026-11-07 09')).toBe('9A')
    expect(hourLabel('2026-11-07 12')).toBe('12P')
    expect(hourLabel('2026-11-07 16')).toBe('4P')
  })
})

describe('HistoryScreen', () => {
  it('plots one dot per hourly average', () => {
    const points = [
      { hour: '2026-11-07 14', avg_health: 80 },
      { hour: '2026-11-07 15', avg_health: 70 },
      { hour: '2026-11-07 16', avg_health: 90 },
    ]
    const { container } = render(<HistoryScreen plant={plant} points={points} />)
    expect(container.querySelectorAll('.chart-dot')).toHaveLength(3)
    expect(container.querySelector('.chart-line')).toBeTruthy()
    expect(screen.getByText(/hourly avg/)).toBeTruthy()
  })

  it('shows an empty state with no data', () => {
    render(<HistoryScreen plant={plant} points={[]} />)
    expect(screen.getByText(/No data yet/)).toBeTruthy()
  })
})
