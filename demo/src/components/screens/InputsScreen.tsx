import { metricRows } from '../../lib/mqttContract'
import type { PlantType, Telemetry } from '../../lib/types'
import { PageFoot } from '../PageFoot'
import { Sprite } from '../Sprite'

type Props = {
  plant: PlantType
  telemetry: Telemetry
}

function formatValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** Every numeric reading from the MQTT telemetry payload. */
export function InputsScreen({ plant, telemetry }: Props) {
  const rows = metricRows(telemetry.metrics)

  return (
    <div className="screen-page">
      <header className="act-header">
        <Sprite plantTypeId={plant.plant_type_id} spriteRef={plant.sprite_ref} />
        <div>
          <div className="act-title">Inputs</div>
          <div className="act-sub">{telemetry.device_id}</div>
        </div>
      </header>
      <ul className="input-list">
        {rows.map((row) => (
          <li key={row.key}>
            <span>{row.label}</span>
            <span>
              {formatValue(row.value)}
              {row.unit ? ` ${row.unit}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <PageFoot index={1} hint="← →" />
    </div>
  )
}
