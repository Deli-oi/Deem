type Props = { plantTypeId?: string; title?: string }

/** Placeholder retro mascot until generated sprites are attached in Mongo. */
export function Sprite({ plantTypeId = 'plant', title }: Props) {
  return <div className="sprite" title={title ?? plantTypeId} aria-hidden />
}
