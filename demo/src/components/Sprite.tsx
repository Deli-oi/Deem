import { useState } from 'react'

type Props = {
  plantTypeId?: string
  spriteRef?: string | null
  title?: string
}

/**
 * Retro mascot. Prefers an explicit sprite_ref from plant data, then
 * `/sprites/<plant_type_id>.png`, then the CSS placeholder.
 */
export function Sprite({ plantTypeId = 'plant', spriteRef, title }: Props) {
  const [failed, setFailed] = useState(false)
  const src = spriteRef || `/sprites/${plantTypeId}.png`

  if (failed) {
    return <div className="sprite sprite--fallback" title={title ?? plantTypeId} aria-hidden />
  }

  return (
    <img
      className="sprite sprite--img"
      src={src}
      alt=""
      title={title ?? plantTypeId}
      width={42}
      height={42}
      onError={() => setFailed(true)}
    />
  )
}

/**
 * The wilting, slightly gray version of a plant, shown big when something needs fixing.
 * Falls back to the healthy sprite, grayed with CSS, if a wilted image is missing.
 */
export function WiltedSprite({ plantTypeId = 'plant', title }: { plantTypeId?: string; title?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <img
      className={failed ? 'wilted-sprite wilted-sprite--fallback' : 'wilted-sprite'}
      src={failed ? `/sprites/${plantTypeId}.png` : `/sprites/wilted/${plantTypeId}.png`}
      alt=""
      title={title ?? plantTypeId}
      onError={() => setFailed(true)}
    />
  )
}
