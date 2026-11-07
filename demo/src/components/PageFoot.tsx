import type { ReactNode } from 'react'

const PAGES = 3

/** Bottom strip of every live page. The right side is left clear for the on-screen buttons. */
export function PageFoot({ index, hint, children }: { index: number; hint: string; children?: ReactNode }) {
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
      </div>
    </div>
  )
}
