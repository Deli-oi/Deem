import type { HealthPoint, PlantType } from '../../lib/types'
import { PageFoot } from '../PageFoot'
import { Sprite } from '../Sprite'

type Props = {
  plant: PlantType
  points: HealthPoint[]
}

const W = 260
const H = 150
const PAD = { left: 24, right: 10, top: 12, bottom: 18 }

/** "2026-11-07 16" -> "4P" */
export function hourLabel(hour: string): string {
  const h = Number(hour.slice(11, 13))
  return `${h % 12 || 12}${h < 12 ? 'A' : 'P'}`
}

/** Plotted line of the average health per hour (0-100), oldest to newest. */
export function HistoryScreen({ plant, points }: Props) {
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => (points.length < 2 ? PAD.left + plotW / 2 : PAD.left + (i / (points.length - 1)) * plotW)
  const y = (v: number) => PAD.top + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  const last = points[points.length - 1]

  return (
    <div className="screen-page health-activity">
      <header className="act-header">
        <Sprite plantTypeId={plant.plant_type_id} spriteRef={plant.sprite_ref} />
        <div className="act-title-block">
          <div className="act-title">History</div>
          <div className="act-sub">hourly avg · {plant.common_names[0]}</div>
        </div>
      </header>

      <div className="history-chart" aria-label="Average plant health per hour">
        {points.length === 0 ? (
          <p className="chart-empty">No data yet. The first point appears after a test.</p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hourly health line chart">
            {[0, 50, 100].map((g) => (
              <g key={g}>
                <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} />
                <text className="chart-label" x={PAD.left - 4} y={y(g) + 2} textAnchor="end">
                  {g}
                </text>
              </g>
            ))}
            {points.length > 1 && (
              <polyline
                className="chart-line"
                points={points.map((p, i) => `${x(i)},${y(p.avg_health)}`).join(' ')}
              />
            )}
            {points.map((p, i) => (
              <g key={p.hour}>
                <rect
                  className={i === points.length - 1 ? 'chart-dot now' : 'chart-dot'}
                  x={x(i) - 2.5}
                  y={y(p.avg_health) - 2.5}
                  width="5"
                  height="5"
                />
                {(i % labelEvery === 0 || i === points.length - 1) && (
                  <text className="chart-label" x={x(i)} y={H - 4} textAnchor="middle">
                    {hourLabel(p.hour)}
                  </text>
                )}
              </g>
            ))}
            {last && (
              <text className="chart-now" x={Math.min(x(points.length - 1), W - PAD.right - 6)} y={y(last.avg_health) - 7} textAnchor="end">
                {last.avg_health}
              </text>
            )}
          </svg>
        )}
      </div>

      <PageFoot index={2} hint="← swipe" />
    </div>
  )
}
