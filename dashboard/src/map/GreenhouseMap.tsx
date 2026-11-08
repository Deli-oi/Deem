import { useEffect, useRef } from 'react'
import { MAP_COLS, MAP_ROWS, PLANT_TILES, TILE, ZONES } from '../data/layout'
import type { AirHub, PlantRecord } from '../data/greenhouse'
import { drawGreenhouse } from './drawGreenhouse'

type Props = {
  plants: PlantRecord[]
  hubs: AirHub[]
  selectedId: string | null
  /** Dim every plant that is not this type (a type was picked in the breakdown). */
  focusType: string | null
  onPlant: (id: string) => void
  onHub: (zone: AirHub['zone']) => void
}

const pctX = (tiles: number) => `${(tiles / MAP_COLS) * 100}%`
const pctY = (tiles: number) => `${(tiles / MAP_ROWS) * 100}%`

/** The greenhouse as a pixel-art floor plan; every plant and air hub on it is clickable. */
export function GreenhouseMap({ plants, hubs, selectedId, focusType, onPlant, onHub }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx) drawGreenhouse(ctx)
  }, [])

  return (
    <div className="gh-map" role="group" aria-label="Greenhouse floor plan">
      <canvas ref={canvas} width={MAP_COLS * TILE} height={MAP_ROWS * TILE} className="gh-canvas" aria-hidden="true" />

      {ZONES.map((z) => (
        <div key={z.id} className="gh-zone-label" style={{ left: pctX(z.x0), top: pctY(3.25) }}>
          <b>ZONE {z.id}</b> {z.name}
        </div>
      ))}

      {ZONES.map((z) => {
        const hub = hubs.find((h) => h.zone === z.id)!
        return (
          <button
            key={`hub-${z.id}`}
            type="button"
            className="gh-hub"
            style={{ left: pctX(z.hub.x - 0.5), top: pctY(z.hub.y), width: pctX(3), height: pctY(5.6) }}
            onClick={() => onHub(z.id)}
            aria-label={`Air quality hub, zone ${z.id}`}
            data-tip={`Air hub ${z.id}: ${hub.metrics.co2_ppm} ppm CO2`}
          >
            <span className="gh-hub-chip">
              AIR {z.id}
              <i>{hub.metrics.co2_ppm}</i>
            </span>
          </button>
        )
      })}

      {plants.map((p) => {
        const dim = focusType !== null && p.typeId !== focusType
        return (
          <button
            key={p.id}
            type="button"
            className={`gh-plant status-${p.status}${dim ? ' dim' : ''}${selectedId === p.id ? ' selected' : ''}`}
            style={{ left: pctX(p.tile.x), top: pctY(p.tile.y), width: pctX(PLANT_TILES), height: pctY(PLANT_TILES) }}
            onClick={() => onPlant(p.id)}
            aria-label={`${p.type.common_names[0]} ${p.id}, health ${p.health}${p.alerts.length ? ', needs attention' : ''}`}
            data-tip={`${p.type.common_names[0]} · ${p.id}`}
          >
            <img src={`/map/${p.typeId}.png`} alt="" draggable={false} />
            <span className="gh-pin">{p.health}</span>
            {p.alerts.length > 0 && <span className="gh-bang" aria-hidden="true">!</span>}
          </button>
        )
      })}
    </div>
  )
}
