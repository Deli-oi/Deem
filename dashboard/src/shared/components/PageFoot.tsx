// SYNCED FROM demo/src/components/PageFoot.tsx. Do not edit here: change it in demo/ and run `npm run sync`.
import type { ReactNode } from 'react'

const PAGES = 3

/** Bottom strip of every live page: page dots, swipe hint, and an optional hint for a physical key. */
export function PageFoot({
  index,
  hint,
  keyHint,
  children,
}: {
  index: number
  hint: string
  /** Points at a physical key below the screen (it is not a button on the screen). */
  keyHint?: string
  children?: ReactNode
}) {
  return (
    <div className="page-foot">
      {children}
      <div className="page-nav">
        <span className="page-dots" aria-hidden="true">
          {Array.from({ length: PAGES }, (_, i) => (
            <i key={i} className={i === index ? 'on' : ''} />
          ))}
        </span>
        <span className="act-hint">{hint}</span>
        {keyHint && <span className="key-hint">{keyHint}</span>}
      </div>
    </div>
  )
}
