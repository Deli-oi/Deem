import { useEffect, useState } from 'react'
import type { PlantMatch, PlantType } from '../../lib/types'

type Phase = 'prompt' | 'match' | 'sensor_check'

export type SensorState = { name: string; state: 'pending' | 'ok' | 'fail' }

export type VoiceState = 'idle' | 'recording' | 'transcribing'

type Props = {
  phase: Phase
  match: PlantMatch | null
  sensors: SensorState[]
  sensorError: string | null
  /** Matching the heard plant name against the database. */
  busy: boolean
  voiceState: VoiceState
  /** What the device heard (shown so a mis-hearing is obvious). */
  heard: string | null
  voiceError: string | null
  onConfirmMatch: () => void
  onRetry: () => void
  onRecheck: () => void
}

function promptStatus({ voiceState, busy, heard, voiceError }: Pick<Props, 'voiceState' | 'busy' | 'heard' | 'voiceError'>) {
  if (voiceError) return voiceError
  if (voiceState === 'recording') return 'Listening... tap the mic when done'
  if (voiceState === 'transcribing') return 'Hearing you...'
  if (busy) return 'Matching...'
  if (heard) return `Heard: "${heard}"`
  return 'Tap the mic to start'
}

export function SetupFlow({
  phase,
  match,
  sensors,
  sensorError,
  busy,
  voiceState,
  heard,
  voiceError,
  onConfirmMatch,
  onRetry,
  onRecheck,
}: Props) {
  if (phase === 'prompt') {
    return (
      <div className="setup-screen">
        <div className="act-title">Setup</div>
        <p className="setup-copy">Tap the mic and say your plant.</p>
        <div className={`voice-status ${voiceError ? 'error' : voiceState}`} role="status">
          <span className="voice-dot" />
          <span>{promptStatus({ voiceState, busy, heard, voiceError })}</span>
        </div>
        <p className="setup-copy hint">Try "golden pothos" or "dracaena".</p>
      </div>
    )
  }

  if (phase === 'match' && match) {
    return (
      <ConfirmMatch
        match={match}
        heard={heard}
        onRetry={onRetry}
        onConfirmMatch={onConfirmMatch}
      />
    )
  }

  if (phase === 'match' && !match) {
    return (
      <div className="setup-screen">
        <div className="act-title">No match</div>
        <p className="setup-copy">{heard ? `Heard "${heard}". ` : ''}Try another houseplant.</p>
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
  heard,
  onRetry,
  onConfirmMatch,
}: {
  match: PlantMatch
  heard: string | null
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
      {heard && <p className="setup-copy hint">Heard: "{heard}"</p>}
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
