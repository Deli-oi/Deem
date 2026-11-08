import { ActivityRings } from '../shared/components/ActivityRings'
import { STATUS_COLOR, STATUS_LABEL } from '../lib/health'
import type { Status } from '../lib/health'

/** A reading against its healthy range: the band is the healthy range, the marker is the value now. */
export function RangeMeter({
  label,
  value,
  min,
  max,
  unit = '',
  digits = 0,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  unit?: string
  digits?: number
  hint?: string
}) {
  const span = max - min
  const lo = min - span * 0.35
  const hi = max + span * 0.35
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`
  const ok = value >= min && value <= max
  return (
    <div className={`gh-meter${ok ? '' : ' bad'}`}>
      <div className="gh-meter-head">
        <span>{label}</span>
        <b>
          {value.toFixed(digits)}
          {unit && <i>{unit}</i>}
        </b>
      </div>
      <div className="gh-meter-bar" role="img" aria-label={`${label} ${value.toFixed(digits)}${unit}, healthy ${min} to ${max}`}>
        <span className="gh-meter-band" style={{ left: at(min), width: `calc(${at(max)} - ${at(min)})` }} />
        <span className="gh-meter-mark" style={{ left: at(value) }} />
      </div>
      <div className="gh-meter-foot">
        <span>
          {min}
          {unit}
        </span>
        <span>{hint ?? (ok ? 'in range' : value < min ? 'too low' : 'too high')}</span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  )
}

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className="gh-chip" style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }}>
      {STATUS_LABEL[status]}
    </span>
  )
}

/** The device's three activity rings, reused as a greenhouse summary. */
export function HealthRings({ health, a, b, size = 168 }: { health: number; a: number; b: number; size?: number }) {
  return (
    <div className="gh-rings" style={{ width: size, height: size }}>
      <ActivityRings
        size={size}
        rings={[
          { progress: health / 100, color: '#5b9a3c', track: '#eadfc4' },
          { progress: a / 100, color: '#f0b43a', track: '#eadfc4' },
          { progress: b / 100, color: '#6cb7dd', track: '#eadfc4' },
        ]}
      />
      <div className="gh-rings-score">
        <b>{health}</b>
        <span>health</span>
      </div>
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={`gh-stat${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <i>{sub}</i>}
    </div>
  )
}
