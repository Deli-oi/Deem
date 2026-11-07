import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenButtons } from './ScreenButtons'

afterEach(cleanup)

describe('ScreenButtons', () => {
  it('shows TEST above MIC once the plant is live', () => {
    render(<ScreenButtons showTest onTest={() => {}} onMic={() => {}} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['TESTnow', 'MICask'])
  })

  it('shows only MIC during setup', () => {
    render(<ScreenButtons showTest={false} onTest={() => {}} onMic={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button').textContent).toContain('MIC')
  })

  it('fires the right callback and shows listening', () => {
    const onTest = vi.fn()
    const onMic = vi.fn()
    const { rerender } = render(<ScreenButtons showTest onTest={onTest} onMic={onMic} />)
    fireEvent.click(screen.getByText('TEST'))
    fireEvent.click(screen.getByText('MIC'))
    expect(onTest).toHaveBeenCalledTimes(1)
    expect(onMic).toHaveBeenCalledTimes(1)
    rerender(<ScreenButtons showTest listening onTest={onTest} onMic={onMic} />)
    expect(screen.getByText('listening')).toBeTruthy()
  })
})
