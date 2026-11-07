type Props = {
  disabled?: boolean
  onVoice: () => void
  onCollect: () => void
  onConfirm: () => void
  onWater: () => void
}

export function FakeButtons({ disabled, onVoice, onCollect, onConfirm, onWater }: Props) {
  return (
    <div className="hardware-deck">
      <button type="button" className="hw-btn accent" disabled={disabled} onClick={onVoice}>
        <span className="glyph">MIC</span>
        <span className="txt">Ask</span>
      </button>
      <button type="button" className="hw-btn primary" disabled={disabled} onClick={onCollect}>
        <span className="glyph">NOW</span>
        <span className="txt">Collect</span>
      </button>
      <button type="button" className="hw-btn" disabled={disabled} onClick={onConfirm}>
        <span className="glyph">OK</span>
        <span className="txt">Confirm</span>
      </button>
      <button type="button" className="hw-btn" disabled={disabled} onClick={onWater}>
        <span className="glyph">H2O</span>
        <span className="txt">Water</span>
      </button>
    </div>
  )
}
