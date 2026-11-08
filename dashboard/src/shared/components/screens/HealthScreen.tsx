// SYNCED FROM demo/src/components/screens/HealthScreen.tsx. Do not edit here: change it in demo/ and run `npm run sync`.
import { ActivityRings, metricProgress } from '../ActivityRings'
import { healthLabel } from '../../lib/healthScore'
import type { Alert } from '../../lib/alerts'
import type { PlantType, Telemetry } from '../../lib/types'
import { PageFoot } from '../PageFoot'
import { Sprite } from '../Sprite'

type Props = {
  plant: PlantType
  telemetry: Telemetry
  /** Readings outside the healthy range right now. */
  alerts?: Alert[]
}

export function HealthScreen({ plant, telemetry, alerts = [] }: Props) {
  const score = telemetry.health_score ?? 0
  const testedAt = new Date((telemetry.received_ts ?? telemetry.ts) * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  const m = telemetry.metrics
  const t = plant.thresholds

  const soilP = metricProgress(m.soil_moisture, t.soil_moisture.min, t.soil_moisture.max)
  const tempP = metricProgress(m.temp_c, t.temp_c.min, t.temp_c.max)
  const rhP = metricProgress(m.rh_pct, t.rh_pct.min, t.rh_pct.max)

  return (
    <div className="screen-page health-activity">
      <header className="act-header">
        <Sprite
          plantTypeId={plant.plant_type_id}
          spriteRef={plant.sprite_ref}
          title={plant.common_names[0]}
        />
        <div className="act-title-block">
          <div className="act-title">Health</div>
          <div className="act-sub">{plant.common_names[0]}</div>
        </div>
        <div className="act-test">
          <span>LAST TEST</span>
          <b>{testedAt}</b>
        </div>
      </header>

      {alerts.length > 0 && (
        <div className="alert-bar" role="alert">
          <span className="voice-dot" />
          <span>{alerts.map((a) => a.label).join(' · ')}</span>
        </div>
      )}

      <div className="act-main">
        <div className="act-stats">
          <Stat
            label="Soil"
            value={num(m.soil_moisture)}
            unit=""
            color="var(--soil)"
            warn={out(m.soil_moisture, t.soil_moisture.min, t.soil_moisture.max)}
          />
          <Stat
            label="Temp"
            value={num(m.temp_c, 0)}
            unit="°C"
            color="var(--temp)"
            warn={out(m.temp_c, t.temp_c.min, t.temp_c.max)}
          />
          <Stat
            label="Air RH"
            value={num(m.rh_pct)}
            unit="%"
            color="var(--rh)"
            warn={out(m.rh_pct, t.rh_pct.min, t.rh_pct.max)}
          />
        </div>

        <div className="act-rings-wrap">
          <ActivityRings
            size={118}
            rings={[
              { progress: soilP, color: '#ff2d55', track: '#2c2c2e' },
              { progress: tempP, color: '#d4ff4a', track: '#2c2c2e' },
              { progress: rhP, color: '#64d2ff', track: '#2c2c2e' },
            ]}
          />
          <div className="act-score-pip">
            <span className="n">{score}</span>
            <span className="l">{healthLabel(score).split(' ')[0]}</span>
          </div>
        </div>
      </div>

      <PageFoot index={0} hint="swipe →" keyHint="solution needed? ↓">
        <div className="act-footer">
          <div>
            <div className="k">CO₂</div>
            <div className="v">{num(m.co2_ppm)}</div>
          </div>
          <div>
            <div className="k">Soil °C</div>
            <div className="v">{num(m.soil_temp_c, 1)}</div>
          </div>
        </div>
      </PageFoot>
    </div>
  )
}

function Stat({
  label,
  value,
  unit,
  color,
  warn,
}: {
  label: string
  value: string
  unit: string
  color: string
  warn?: boolean
}) {
  return (
    <div className={`act-stat${warn ? ' warn' : ''}`}>
      <div className="act-stat-label">{label}</div>
      <div className="act-stat-value" style={{ color }}>
        {value}
        <span className="u">{unit}</span>
      </div>
    </div>
  )
}

function num(value: number | undefined, digits?: number) {
  if (value == null) return '--'
  return digits == null || Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

function out(value: number | undefined, min: number | null | undefined, max: number | null | undefined) {
  if (value == null) return false
  if (min != null && value < min) return true
  if (max != null && value > max) return true
  return false
}
