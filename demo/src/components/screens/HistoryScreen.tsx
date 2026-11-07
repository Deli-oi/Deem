import type { DailyHealth, PlantType } from '../../lib/types'
import { Sprite } from '../Sprite'

type Props = {
  plant: PlantType
  days: DailyHealth[]
}

export function HistoryScreen({ plant, days }: Props) {
  const max = Math.max(...days.map((d) => d.avg_health), 1)

  return (
    <div className="screen-page health-activity">
      <header className="act-header">
        <Sprite plantTypeId={plant.plant_type_id} spriteRef={plant.sprite_ref} />
        <div className="act-title-block">
          <div className="act-title">History</div>
          <div className="act-sub">daily avg · {plant.common_names[0]}</div>
        </div>
      </header>

      <div className="history-chart retro" aria-label="Daily health chart">
        {days.map((d) => {
          const h = Math.max(10, Math.round((d.avg_health / max) * 100))
          return (
            <div className="bar-wrap" key={d.date}>
              <div className="bar-val">{d.avg_health}</div>
              <div className="bar" style={{ height: `${h}%` }} />
              <div className="day">{d.date.slice(8)}</div>
            </div>
          )
        })}
      </div>

      <div className="act-hint">← swipe health</div>
    </div>
  )
}
