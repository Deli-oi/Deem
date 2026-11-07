import { ActivityRings, metricProgress } from '../ActivityRings'
import { healthLabel } from '../../lib/healthScore'
import type { PlantType, Telemetry } from '../../lib/types'
import { Sprite } from '../Sprite'

type Props = {
  plant: PlantType
  telemetry: Telemetry
}

export function HealthScreen({ plant, telemetry }: Props) {
  const score = telemetry.health_score ?? 0
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
      </header>

      <div className="act-main">
        <div className="act-stats">
          <Stat
            label="Soil"
            value={`${m.soil_moisture}`}
            unit=""
            color="var(--ring-soil)"
            warn={out(m.soil_moisture, t.soil_moisture.min, t.soil_moisture.max)}
          />
          <Stat
            label="Temp"
            value={`${m.temp_c.toFixed(0)}`}
            unit="°C"
            color="var(--ring-temp)"
            warn={out(m.temp_c, t.temp_c.min, t.temp_c.max)}
          />
          <Stat
            label="Air RH"
            value={`${m.rh_pct}`}
            unit="%"
            color="var(--ring-rh)"
            warn={out(m.rh_pct, t.rh_pct.min, t.rh_pct.max)}
          />
        </div>

        <div className="act-rings-wrap">
          <ActivityRings
            size={118}
            rings={[
              { progress: soilP, color: 'var(--ring-soil)', track: 'var(--ring-track)' },
              { progress: tempP, color: 'var(--ring-temp)', track: 'var(--ring-track)' },
              { progress: rhP, color: 'var(--ring-rh)', track: 'var(--ring-track)' },
            ]}
          />
          <div className="act-score-pip">
            <span className="n">{score}</span>
            <span className="l">{healthLabel(score).split(' ')[0]}</span>
          </div>
        </div>
      </div>

      <div className="act-divider" />

      <div className="act-footer">
        <div>
          <div className="k">CO₂</div>
          <div className="v">{m.co2_ppm}</div>
        </div>
        <div>
          <div className="k">Soil °C</div>
          <div className="v">{m.soil_temp_c.toFixed(1)}</div>
        </div>
      </div>

      <div className="act-hint">swipe → history · ask ↓</div>
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

function out(value: number, min: number | null | undefined, max: number | null | undefined) {
  if (min != null && value < min) return true
  if (max != null && value > max) return true
  return false
}
