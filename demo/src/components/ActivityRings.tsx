type Ring = {
  progress: number // 0..1+ (can exceed 1 for overshoot)
  color: string
  track: string
}

type Props = {
  rings: [Ring, Ring, Ring]
  size?: number
}

/** Chunky concentric rings — Activity layout, retro stepped strokes. */
export function ActivityRings({ rings, size = 128 }: Props) {
  const cx = size / 2
  const cy = size / 2
  const radii = [size * 0.42, size * 0.3, size * 0.18]
  const stroke = size * 0.09

  return (
    <svg
      className="activity-rings"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      {rings.map((ring, i) => {
        const r = radii[i]
        const c = 2 * Math.PI * r
        const p = Math.max(0, Math.min(ring.progress, 1.35))
        const dash = Math.min(p, 1) * c
        return (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={ring.track}
              strokeWidth={stroke}
              strokeLinecap="butt"
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={ring.color}
              strokeWidth={stroke}
              strokeLinecap="square"
              strokeDasharray={`${dash} ${c}`}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="ring-arc"
            />
          </g>
        )
      })}
    </svg>
  )
}

/** Map sensor values into 0..1+ ring fills against plant thresholds. */
export function metricProgress(
  value: number | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): number {
  if (value == null || min == null || max == null || max <= min) return 0.5
  if (value < min) return Math.max(0.08, value / Math.max(min, 1))
  if (value > max) return 1 + Math.min(0.35, (value - max) / Math.max(max, 1))
  // in range → how far through the ideal band (prefer mid = full)
  const mid = (min + max) / 2
  const half = (max - min) / 2
  const dist = Math.abs(value - mid)
  return 1 - (dist / half) * 0.25
}
