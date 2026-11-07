import type { DailyHealth, PlantType } from '../../lib/types'
import { Sprite } from '../Sprite'

type Props = {
  plant: PlantType
  days: DailyHealth[]
}

export function HistoryScreen({ plant, days }: Props) {
  const max = Math.max(...days.map((d) => d.avg_health), 1)

  return (
    <div className="screen-page">
      <div className="top-row">
        <Sprite plantTypeId={plant.plant_type_id} />
        <div className="meta">
          <div className="name">History</div>
          <div className="sci">Daily average health · {plant.common_names[0]}</div>
        </div>
      </div>

      <div className="history-title">Week trend</div>

      <div className="history-chart" aria-label="Daily health chart">
        {days.map((d) => {
          const h = Math.max(8, Math.round((d.avg_health / max) * 100))
          return (
            <div className="bar-wrap" key={d.date}>
              <div className="bar" style={{ height: `${h}%` }} title={`${d.avg_health}`} />
              <div className="day">{d.date.slice(5)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
