import type { VoiceState } from './screens/SetupFlow'

type Props = {
  state: VoiceState
  /** True while the app is busy with the last thing you said (matching a plant, or answering). */
  disabled?: boolean
  onTap: () => void
}

const LABEL: Record<VoiceState, { main: string; sub: string }> = {
  idle: { main: 'MIC', sub: 'tap to talk' },
  recording: { main: 'LISTENING', sub: 'tap to stop' },
  transcribing: { main: 'HEARING', sub: 'one moment' },
}

/**
 * The voice button, along the bottom of the screen. Tap once to turn the mic on, tap again to
 * turn it off and send what you said. (In the production device this is a physical button; it
 * does the same thing through the same handler.)
 */
export function MicButton({ state, disabled, onTap }: Props) {
  const { main, sub } = LABEL[state]
  return (
    <button
      type="button"
      className={`mic-bar ${state}`}
      disabled={disabled || state === 'transcribing'}
      aria-pressed={state === 'recording'}
      aria-label={state === 'recording' ? 'Turn the microphone off and send' : 'Turn the microphone on'}
      onClick={onTap}
    >
      <span className="mic-icon" aria-hidden="true" />
      <span className="mic-main">{main}</span>
      <span className="mic-sub">{sub}</span>
    </button>
  )
}
