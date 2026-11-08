import { adviceFor } from '../../lib/advice'
import type { Alert } from '../../lib/alerts'
import type { PlantType, Telemetry } from '../../lib/types'
import { PageFoot } from '../PageFoot'
import { WiltedSprite } from '../Sprite'

type Props = {
  plant: PlantType
  telemetry: Telemetry
  /** Out-of-range readings, most important first. There is at least one. */
  alerts: Alert[]
}

/**
 * Shown instead of the health page while something needs fixing: a wilting, grayed version of
 * the plant fills most of the screen, with what is wrong and one sentence on what to do.
 * The same image is used for every kind of failure.
 */
export function FailureScreen({ plant, telemetry, alerts }: Props) {
  const testedAt = new Date((telemetry.received_ts ?? telemetry.ts) * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="screen-page failure-page" role="alert">
      <div className="failure-stage">
        <div className="failure-chip tl">{plant.common_names[0]}</div>
        <div className="failure-chip tr">{testedAt}</div>
        <WiltedSprite plantTypeId={plant.plant_type_id} title={`${plant.common_names[0]} needs help`} />
      </div>
      <div className="failure-label">{alerts.map((a) => a.label).join(' · ')}</div>
      <p className="failure-advice">{adviceFor(plant, alerts[0])}</p>
      <PageFoot index={0} hint="swipe →" keyHint="solution needed? ↓" />
    </div>
  )
}
