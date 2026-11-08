import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Alert } from '../../lib/alerts'
import type { PlantType, Telemetry } from '../../lib/types'
import { FailureScreen } from './FailureScreen'

afterEach(cleanup)

const plant = {
  plant_type_id: 'dracaena',
  common_names: ['dracaena'],
  scientific_name: '',
  thresholds: {},
  care: {},
  solutions: [
    { problem: 'soil_too_dry', trigger: { metric: 'soil_moisture', op: '<', value: 15 }, advice: 'Water thoroughly until water drains, then empty the saucer. Avoid letting it stay bone-dry.' },
  ],
} as unknown as PlantType

const telemetry = { device_id: 'esp32-pot-01', ts: 1731000000, metrics: { soil_moisture: 9 } } as Telemetry
const dry: Alert = { metric: 'soil_moisture', direction: 'low', value: 9, limit: 15, label: 'Soil too dry' }

describe('FailureScreen', () => {
  it('shows the wilted plant, what is wrong, and ONE sentence on what to do', () => {
    const { container } = render(<FailureScreen plant={plant} telemetry={telemetry} alerts={[dry]} />)
    const img = container.querySelector('.wilted-sprite') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/sprites/wilted/dracaena.png')
    expect(screen.getByText('Soil too dry')).toBeTruthy()
    expect(screen.getByText('Water thoroughly until water drains, then empty the saucer.')).toBeTruthy()
    expect(screen.queryByText(/bone-dry/)).toBeNull()
  })

  it('uses the same image whatever the failure is', () => {
    const cold: Alert = { metric: 'temp_c', direction: 'low', value: 5, limit: 10, label: 'Too cold' }
    const a = render(<FailureScreen plant={plant} telemetry={telemetry} alerts={[dry]} />)
    const srcA = (a.container.querySelector('.wilted-sprite') as HTMLImageElement).getAttribute('src')
    cleanup()
    const b = render(<FailureScreen plant={plant} telemetry={telemetry} alerts={[cold]} />)
    expect((b.container.querySelector('.wilted-sprite') as HTMLImageElement).getAttribute('src')).toBe(srcA)
  })

  it('lists every problem but gives advice for the most important', () => {
    const cold: Alert = { metric: 'temp_c', direction: 'low', value: 5, limit: 10, label: 'Too cold' }
    render(<FailureScreen plant={plant} telemetry={telemetry} alerts={[dry, cold]} />)
    expect(screen.getByText('Soil too dry · Too cold')).toBeTruthy()
    expect(screen.getByText(/Water thoroughly/)).toBeTruthy()
  })

  it('falls back to the grayed healthy sprite if the wilted image is missing', () => {
    const { container } = render(<FailureScreen plant={plant} telemetry={telemetry} alerts={[dry]} />)
    const img = container.querySelector('.wilted-sprite') as HTMLImageElement
    fireEvent.error(img)
    expect(img.getAttribute('src')).toBe('/sprites/dracaena.png')
    expect(img.className).toContain('wilted-sprite--fallback')
  })
})
