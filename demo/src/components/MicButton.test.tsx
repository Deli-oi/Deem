import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MicButton } from './MicButton'

afterEach(cleanup)

describe('MicButton', () => {
  it('invites a tap when idle', () => {
    render(<MicButton state="idle" onTap={() => {}} />)
    const b = screen.getByRole('button', { name: 'Turn the microphone on' })
    expect(b.textContent).toContain('MIC')
    expect(b.textContent).toContain('tap to talk')
    expect(b.getAttribute('aria-pressed')).toBe('false')
  })

  it('says it is listening and offers to stop while recording', () => {
    render(<MicButton state="recording" onTap={() => {}} />)
    const b = screen.getByRole('button', { name: 'Turn the microphone off and send' })
    expect(b.textContent).toContain('LISTENING')
    expect(b.textContent).toContain('tap to stop')
    expect(b.getAttribute('aria-pressed')).toBe('true')
  })

  it('cannot be tapped while the speech is being turned into text', () => {
    const onTap = vi.fn()
    render(<MicButton state="transcribing" onTap={onTap} />)
    const b = screen.getByRole('button')
    expect(b.textContent).toContain('HEARING')
    expect((b as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(b)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('is disabled while the app is busy with what you said', () => {
    render(<MicButton state="idle" disabled onTap={() => {}} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onTap once per tap (the same handler turns it on and off)', () => {
    const onTap = vi.fn()
    render(<MicButton state="idle" onTap={onTap} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))
    expect(onTap).toHaveBeenCalledTimes(2)
  })
})
