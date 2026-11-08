import { useEffect } from 'react'
import { adviceFor } from '../shared/lib/advice'
import { Sprite } from '../shared/components/Sprite'
import { ZONES } from '../data/layout'
import type { AirHub, PlantRecord } from '../data/greenhouse'
import { STATUS_COLOR } from '../lib/health'
import { MiniDevice } from './MiniDevice'
import { RangeMeter, StatusChip } from './ui'

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="gh-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`gh-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="gh-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}

/** A plant's pop-up: the live device display, plus the soil quality the larger system watches. */
export function PlantPopup({ plant, onClose, onStep }: { plant: PlantRecord; onClose: () => void; onStep: (d: 1 | -1) => void }) {
  const zone = ZONES.find((z) => z.id === plant.zone)!
  const m = plant.metrics
  const t = plant.type.thresholds
  const name = plant.type.common_names[0]
  return (
    <Modal title={`${name} ${plant.id}`} onClose={onClose}>
      <div className="gh-popup">
        <MiniDevice key={plant.id} plant={plant} />
        <div className="gh-popup-side">
          <header className="gh-popup-head">
            <Sprite plantTypeId={plant.typeId} spriteRef={plant.type.sprite_ref} title={name} />
            <div>
              <h2>{name}</h2>
              <p>
                Bed {plant.id} · Zone {zone.id}, {zone.name}
              </p>
            </div>
            <StatusChip status={plant.status} />
          </header>

          {plant.alerts.length > 0 && (
            <div className="gh-callout" role="alert">
              <b>{plant.alerts.map((a) => a.label).join(' · ')}</b>
              <span>{adviceFor(plant.type, plant.alerts[0])}</span>
            </div>
          )}

          <h3>Soil quality (this plant's own probe)</h3>
          <RangeMeter label="Moisture" value={plant.soil.moisture.value} min={plant.soil.moisture.min} max={plant.soil.moisture.max} unit="%" digits={1} />
          <RangeMeter label="Minerals (EC)" value={plant.soil.minerals.value} min={plant.soil.minerals.min} max={plant.soil.minerals.max} unit=" uS" hint={plant.alerts.length ? undefined : 'in range'} />
          <RangeMeter label="Soil temperature" value={plant.soil.temp.value} min={plant.soil.temp.min} max={plant.soil.temp.max} unit="°C" digits={1} hint="guide range" />

          <h3>Climate (kept in range automatically)</h3>
          <div className="gh-auto">
            <span>
              Air temp <b>{m.temp_c.toFixed(1)}°C</b>
              <i>{t.temp_c.min}–{t.temp_c.max}</i>
            </span>
            <span>
              Humidity <b>{m.rh_pct.toFixed(0)}%</b>
              <i>{t.rh_pct.min}–{t.rh_pct.max}</i>
            </span>
            <span>
              CO₂ <b>{m.co2_ppm} ppm</b>
              <i>≤ 1500</i>
            </span>
            <span>
              Dust PM2.5 <b>{m.pm2_5.toFixed(1)}</b>
              <i>≤ 35</i>
            </span>
          </div>

          <footer className="gh-popup-foot">
            <button type="button" onClick={() => onStep(-1)}>
              ‹ Previous plant
            </button>
            <button type="button" onClick={() => onStep(1)}>
              Next plant ›
            </button>
          </footer>
        </div>
      </div>
    </Modal>
  )
}

/** A zone's air-quality hub: the larger sensors, and what the controller is doing about them. */
export function HubPopup({ hub, onClose }: { hub: AirHub; onClose: () => void }) {
  const zone = ZONES.find((z) => z.id === hub.zone)!
  const m = hub.metrics
  return (
    <Modal title={`Air quality hub, zone ${zone.id}`} onClose={onClose} wide>
      <div className="gh-hubpop">
        <header className="gh-popup-head">
          <span className="gh-hub-icon" aria-hidden="true" />
          <div>
            <h2>Air hub {zone.id}</h2>
            <p>
              Zone {zone.id}, {zone.name}. Larger sensors cover the whole zone.
            </p>
          </div>
          <span className="gh-chip" style={{ color: STATUS_COLOR.great, borderColor: STATUS_COLOR.great }}>
            In range
          </span>
        </header>
        <div className="gh-hubpop-grid">
          <RangeMeter label="CO₂" value={m.co2_ppm} min={350} max={1500} unit=" ppm" />
          <RangeMeter label="Dust PM2.5" value={m.pm2_5} min={0} max={35} unit=" ug/m3" digits={1} />
          <RangeMeter label="Dust PM10" value={m.pm10_0} min={0} max={150} unit=" ug/m3" digits={1} />
          <RangeMeter label="Air temperature" value={m.temp_c} min={zone.air.temp_c - 4} max={zone.air.temp_c + 4} unit="°C" digits={1} hint="zone target ±4" />
          <RangeMeter label="Humidity" value={m.rh_pct} min={zone.air.rh_pct - 12} max={zone.air.rh_pct + 12} unit="%" digits={0} hint="zone target ±12" />
        </div>
        <div className="gh-hub-actions">
          <span>
            Vents <b>{hub.ventPct}%</b>
          </span>
          <span>
            Misting <b>{hub.mistOn ? 'running' : 'idle'}</b>
          </span>
          <span>
            Air filter <b>on</b>
          </span>
        </div>
        <p className="gh-note">The controller adjusts vents, misting and filters to hold this zone in range, so only soil problems need a person.</p>
      </div>
    </Modal>
  )
}
