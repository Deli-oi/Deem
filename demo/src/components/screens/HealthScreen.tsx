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
  const thr = plant.thresholds

  return (
    <div className="screen-page">
      <div className="top-row">
        <Sprite
          plantTypeId={plant.plant_type_id}
          spriteRef={plant.sprite_ref}
          title={plant.common_names[0]}
        />
        <div className="meta">
          <div className="name">{plant.common_names[0]}</div>
          <div className="sci">{plant.scientific_name}</div>
        </div>
      </div>

      <div className="health-hero">
        <div className="score">{score}</div>
        <div className="label">{healthLabel(score)}</div>
      </div>

      <div className="metrics-grid">
        <Metric
          k="Soil"
          v={`${m.soil_moisture}`}
          warn={outOfRange(m.soil_moisture, thr.soil_moisture.min, thr.soil_moisture.max)}
        />
        <Metric
          k="Temp"
          v={`${m.temp_c.toFixed(1)}°C`}
          warn={outOfRange(m.temp_c, thr.temp_c.min, thr.temp_c.max)}
        />
        <Metric
          k="Humidity"
          v={`${m.rh_pct}%`}
          warn={outOfRange(m.rh_pct, thr.rh_pct.min, thr.rh_pct.max)}
        />
        <Metric k="CO₂" v={`${m.co2_ppm}`} warn={m.co2_ppm > 1000} />
      </div>

      <div className="ask-hint">
        <span>-v solution needed?</span>
        <span className="arrow">↓</span>
      </div>
    </div>
  )
}

function Metric({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className={`metric${warn ? ' warn' : ''}`}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  )
}

function outOfRange(value: number, min: number | null | undefined, max: number | null | undefined) {
  if (min != null && value < min) return true
  if (max != null && value > max) return true
  return false
}
