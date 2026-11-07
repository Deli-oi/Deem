import { useState } from 'react'
import type { PlantMatch, PlantType } from '../../lib/types'

type Phase = 'prompt' | 'match' | 'sensor_check'

type Props = {
  phase: Phase
  match: PlantMatch | null
  sensorsOnline: string[]
  busy: boolean
  onSubmitUtterance: (text: string) => void
  onRetry: () => void
}

const SENSOR_ORDER = ['Soil moisture', 'Air quality', 'Temp / RH', 'Relay']

export function SetupFlow({
  phase,
  match,
  sensorsOnline,
  busy,
  onSubmitUtterance,
  onRetry,
}: Props) {
  const [text, setText] = useState('dracaena')

  if (phase === 'prompt') {
    return (
      <div className="setup-screen">
        <h1>Say your plant</h1>
        <p>
          Press the voice button below, or type a stand-in for speech. We&apos;ll match it to the
          plant knowledge base.
        </p>
        <input
          className="setup-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. panda plant"
          aria-label="Plant name"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) onSubmitUtterance(text.trim())
          }}
        />
        <p style={{ fontSize: '0.78rem', marginTop: 'auto' }}>
          {busy ? 'Listening / matching…' : 'Tip: try “corn plant” or “peace lily”.'}
        </p>
      </div>
    )
  }

  if (phase === 'match' && match) {
    return (
      <div className="setup-screen">
        <h1>Is this right?</h1>
        <p>Matched from your voice input.</p>
        <div className="match-card">
          <strong>{prettyName(match.plant)}</strong>
          <div className="sci">{match.plant.scientific_name}</div>
          <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            confidence {(match.confidence * 100).toFixed(0)}%
          </div>
        </div>
        <p style={{ fontSize: '0.78rem', marginTop: 'auto' }}>
          Confirm with the OK button, or voice again to retry.
        </p>
      </div>
    )
  }

  if (phase === 'match' && !match) {
    return (
      <div className="setup-screen">
        <h1>No close match</h1>
        <p>Hackathon MVP skips the “contact team” path. Try another common houseplant name.</p>
        <button className="chip" type="button" onClick={onRetry} style={{ marginTop: 'auto' }}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="setup-screen">
      <h1>Sensor check</h1>
      <p>Bringing the plant monitor online…</p>
      <ul className="sensor-list">
        {SENSOR_ORDER.map((name) => {
          const ok = sensorsOnline.includes(name)
          return (
            <li key={name} className={ok ? 'ok' : 'pending'}>
              <span>{name}</span>
              <span>{ok ? '✓' : '…'}</span>
            </li>
          )
        })}
      </ul>
      {sensorsOnline.length >= SENSOR_ORDER.length && (
        <p style={{ marginTop: 'auto', color: 'var(--moss)' }}>Done — loading health page…</p>
      )}
    </div>
  )
}

function prettyName(plant: PlantType) {
  return plant.common_names[0] ?? plant.plant_type_id
}
