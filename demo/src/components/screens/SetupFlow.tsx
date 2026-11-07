import { useEffect, useState } from 'react'
import type { PlantMatch, PlantType } from '../../lib/types'

type Phase = 'prompt' | 'match' | 'sensor_check'

export type SensorState = { name: string; state: 'pending' | 'ok' | 'fail' }

type Props = {
  phase: Phase
  match: PlantMatch | null
  sensors: SensorState[]
  sensorError: string | null
  busy: boolean
  onSubmitUtterance: (text: string) => void
  onConfirmMatch: () => void
  onRetry: () => void
  onRecheck: () => void
}

export function SetupFlow({
  phase,
  match,
  sensors,
  sensorError,
  busy,
  onSubmitUtterance,
  onConfirmMatch,
  onRetry,
  onRecheck,
}: Props) {
  const [text, setText] = useState('dracaena')

  if (phase === 'prompt') {
    return (
      <div className="setup-screen">
        <div className="act-title">Setup</div>
        <p className="setup-copy">Say the plant, or type it.</p>
        <input
          className="setup-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="plant name"
          aria-label="Plant name"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) onSubmitUtterance(text.trim())
          }}
        />
        <div className="touch-actions">
          <button
            type="button"
            className="touch-btn primary"
            disabled={busy || !text.trim()}
            onClick={() => onSubmitUtterance(text.trim())}
          >
            {busy ? '...' : 'MATCH'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'match' && match) {
    return (
      <ConfirmMatch
        match={match}
        onRetry={onRetry}
        onConfirmMatch={onConfirmMatch}
      />
    )
  }

  if (phase === 'match' && !match) {
    return (
      <div className="setup-screen">
        <div className="act-title">No match</div>
        <p className="setup-copy">Try another houseplant.</p>
        <div className="touch-actions">
          <button type="button" className="touch-btn primary" onClick={onRetry}>
            RETRY
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="setup-screen">
      <div className="act-title">Sensors</div>
      <ul className="sensor-list">
        {sensors.map(({ name, state }) => (
          <li key={name} className={state === 'ok' ? 'ok' : state === 'fail' ? 'fail' : 'pending'}>
            <span>{name}</span>
            <span>{state === 'ok' ? 'OK' : state === 'fail' ? 'X' : '..'}</span>
          </li>
        ))}
      </ul>
      {sensorError && (
        <>
          <p className="setup-copy">{sensorError}</p>
          <div className="touch-actions dual">
            <button type="button" className="touch-btn" onClick={onRetry}>
              BACK
            </button>
            <button type="button" className="touch-btn primary" onClick={onRecheck}>
              RECHECK
            </button>
          </div>
        </>
      )}
      {!sensorError && sensors.length > 0 && sensors.every((s) => s.state === 'ok') && (
        <p className="setup-copy done">ready</p>
      )}
    </div>
  )
}

function ConfirmMatch({
  match,
  onRetry,
  onConfirmMatch,
}: {
  match: PlantMatch
  onRetry: () => void
  onConfirmMatch: () => void
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 350)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="setup-screen">
      <div className="act-title">Confirm?</div>
      <div className="match-card">
        <strong>{prettyName(match.plant)}</strong>
        <div className="sci">{match.plant.scientific_name}</div>
        <div className="conf">{Math.round(match.confidence * 100)}%</div>
      </div>
      <div className="touch-actions dual">
        <button type="button" className="touch-btn" onClick={onRetry}>
          RETRY
        </button>
        <button type="button" className="touch-btn primary" disabled={!ready} onClick={onConfirmMatch}>
          CONFIRM
        </button>
      </div>
    </div>
  )
}

function prettyName(plant: PlantType) {
  return plant.common_names[0] ?? plant.plant_type_id
}
