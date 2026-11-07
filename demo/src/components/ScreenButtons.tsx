type Props = {
  /** TEST (take a test input) only exists once the plant is set up. */
  showTest: boolean
  disabled?: boolean
  /** True while the mic is "listening" (Fish Audio stand-in). */
  listening?: boolean
  onTest: () => void
  onMic: () => void
}

/**
 * The two on-screen buttons, bottom-right of the display:
 * TEST (take a test input now) stacked above MIC (voice, Fish Audio).
 */
export function ScreenButtons({ showTest, disabled, listening, onTest, onMic }: Props) {
  return (
    <div className="screen-buttons">
      {showTest && (
        <button type="button" className="sb sb-test" disabled={disabled} onClick={onTest}>
          <span className="sb-glyph">TEST</span>
          <span className="sb-sub">now</span>
        </button>
      )}
      <button type="button" className="sb sb-mic" disabled={disabled} onClick={onMic}>
        <span className="sb-glyph">{listening ? '...' : 'MIC'}</span>
        <span className="sb-sub">{listening ? 'listening' : showTest ? 'ask' : 'say'}</span>
      </button>
    </div>
  )
}
