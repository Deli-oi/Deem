import { useEffect, useRef, useState } from 'react'
import { FailureScreen } from '../shared/components/screens/FailureScreen'
import { HealthScreen } from '../shared/components/screens/HealthScreen'
import { HistoryScreen } from '../shared/components/screens/HistoryScreen'
import { InputsScreen } from '../shared/components/screens/InputsScreen'
import type { PlantRecord } from '../data/greenhouse'

type Page = 'health' | 'inputs' | 'history'
const PAGES: Page[] = ['health', 'inputs', 'history']
const TAB_LABEL: Record<Page, string> = { health: 'Health', inputs: 'Inputs', history: 'History' }
const SWIPE_PX = 36

/**
 * The same 2.8" display the single-plant product uses, showing this plant's live readings.
 * Swipe or drag, use the arrow keys, or click the tabs. (The device has no tabs: it is swiped.)
 */
export function MiniDevice({ plant }: { plant: PlantRecord }) {
  const [page, setPage] = useState<Page>('health')
  const start = useRef<number | null>(null)

  const go = (d: 1 | -1) => setPage((p) => PAGES[Math.max(0, Math.min(PAGES.length - 1, PAGES.indexOf(p) + d))])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight') go(1)
      if (e.code === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="gh-mini">
      <div className="device">
        <div className="bezel">
          <div
            className="screen"
            onPointerDown={(e) => {
              start.current = e.clientX
              try {
                e.currentTarget.setPointerCapture(e.pointerId)
              } catch {
                // pointer already gone: the swipe still works from down/up positions
              }
            }}
            onPointerUp={(e) => {
              const s = start.current
              start.current = null
              if (s != null && Math.abs(e.clientX - s) >= SWIPE_PX) go(e.clientX < s ? 1 : -1)
            }}
            onPointerCancel={() => (start.current = null)}
          >
            <div className="screen-track" data-page={page}>
              {plant.alerts.length > 0 ? (
                <FailureScreen plant={plant.type} telemetry={plant.telemetry} alerts={plant.alerts} />
              ) : (
                <HealthScreen plant={plant.type} telemetry={plant.telemetry} alerts={plant.alerts} />
              )}
              <InputsScreen plant={plant.type} telemetry={plant.telemetry} />
              <HistoryScreen plant={plant.type} points={plant.history} />
            </div>
          </div>
        </div>
      </div>
      <div className="gh-mini-tabs" role="tablist" aria-label="Display page">
        {PAGES.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={page === p} className={page === p ? 'on' : ''} onClick={() => setPage(p)}>
            {TAB_LABEL[p]}
          </button>
        ))}
      </div>
      <p className="gh-mini-hint">Swipe the screen, or use the tabs</p>
    </div>
  )
}
