import { useEffect, useMemo, useState } from 'react'
import { greenhouseAt, summarize, summarizeByType } from './data/greenhouse'
import { GreenhouseMap } from './map/GreenhouseMap'
import { HubPopup, PlantPopup } from './components/Popups'
import { HealthSection, HeroBar, PlantsSection, TopBar, TypeSection } from './components/Sections'
import type { ZoneId } from './data/layout'

/** How often the simulated readings move (ms). */
const TICK_MS = 3500

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

export default function App() {
  const now = useNow(TICK_MS)
  const g = useMemo(() => greenhouseAt(now), [now])
  const summary = useMemo(() => summarize(g), [g])
  const types = useMemo(() => summarizeByType(g), [g])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hubZone, setHubZone] = useState<ZoneId | null>(null)
  const [focusType, setFocusType] = useState<string | null>(null)
  const [onlyAlerts, setOnlyAlerts] = useState(false)

  const selected = g.plants.find((p) => p.id === selectedId) ?? null
  const hub = g.hubs.find((h) => h.zone === hubZone) ?? null

  const step = (d: 1 | -1) => {
    const i = g.plants.findIndex((p) => p.id === selectedId)
    if (i === -1) return
    setSelectedId(g.plants[(i + d + g.plants.length) % g.plants.length].id)
  }

  const focus = (id: string | null) => {
    setFocusType(id)
    if (id) document.getElementById('plants')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="gh-app">
      <TopBar now={now} />
      <main>
        <section id="map" className="gh-hero" aria-label="Greenhouse map">
          <HeroBar summary={summary} />
          <div className="gh-stage">
            <GreenhouseMap
              plants={g.plants}
              hubs={g.hubs}
              selectedId={selectedId}
              focusType={focusType}
              onPlant={setSelectedId}
              onHub={setHubZone}
            />
          </div>
        </section>

        <HealthSection g={g} summary={summary} onPlant={setSelectedId} onHub={setHubZone} />
        <TypeSection types={types} focusType={focusType} onFocus={focus} />
        <PlantsSection plants={g.plants} focusType={focusType} onFocus={setFocusType} onlyAlerts={onlyAlerts} onOnlyAlerts={setOnlyAlerts} onPlant={setSelectedId} />
      </main>
      <footer className="gh-footer">
        <b>DEEM</b> Greenhouse is a mock of how Deem scales from one plant to a whole greenhouse. All readings are simulated and not connected to any hardware or database.
      </footer>

      {selected && <PlantPopup plant={selected} onClose={() => setSelectedId(null)} onStep={step} />}
      {hub && <HubPopup hub={hub} onClose={() => setHubZone(null)} />}
    </div>
  )
}
