import { adviceFor } from '../shared/lib/advice'
import { Sprite } from '../shared/components/Sprite'
import { ZONES } from '../data/layout'
import { PLANT_TYPES, controllerLog } from '../data/greenhouse'
import type { Greenhouse, PlantRecord, Summary, TypeSummary } from '../data/greenhouse'
import { STATUS_COLOR } from '../lib/health'
import type { Status } from '../lib/health'
import { HealthRings, RangeMeter, Stat, StatusChip } from './ui'

export function TopBar({ now }: { now: number }) {
  const time = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <header className="gh-top">
      <a className="gh-brand" href="#map" aria-label="Deem greenhouse, back to the map">
        <span className="gh-logo" aria-hidden="true" />
        <b>DEEM</b>
        <span>GREENHOUSE</span>
      </a>
      <nav aria-label="Sections">
        <a href="#map">Map</a>
        <a href="#health">Health</a>
        <a href="#types">By plant</a>
        <a href="#plants">Every plant</a>
      </nav>
      <div className="gh-top-right">
        <span className="gh-client">Verdant Acres · Greenhouse 2</span>
        <span className="gh-live">
          <i /> LIVE · {time}
        </span>
      </div>
    </header>
  )
}

const LEGEND: Array<[Status, string]> = [
  ['great', 'Thriving'],
  ['good', 'Doing well'],
  ['watch', 'Keep an eye'],
  ['alert', 'Needs you'],
]

export function HeroBar({ summary }: { summary: Summary }) {
  return (
    <div className="gh-herobar">
      <div className="gh-herobar-title">
        <h1>Greenhouse 2</h1>
        <p>Click any plant to open its live display. Click an air hub for the zone's sensors.</p>
      </div>
      <div className="gh-pills">
        <span className="gh-pill">
          Health <b>{summary.avgHealth}</b>
        </span>
        <span className={`gh-pill${summary.alertPlants ? ' bad' : ''}`}>
          Need you <b>{summary.alertPlants}</b>
        </span>
        <span className="gh-pill">
          Plants <b>{summary.plantCount}</b>
        </span>
      </div>
      <ul className="gh-legend" aria-label="Health colors">
        {LEGEND.map(([s, label]) => (
          <li key={s}>
            <i style={{ background: STATUS_COLOR[s] }} />
            {label}
          </li>
        ))}
      </ul>
      <a className="gh-scroll" href="#health">
        Greenhouse health ↓
      </a>
    </div>
  )
}

export function HealthSection({ g, summary, onPlant, onHub }: { g: Greenhouse; summary: Summary; onPlant: (id: string) => void; onHub: (z: 'A' | 'B' | 'C') => void }) {
  const needs = g.plants.filter((p) => p.alerts.length > 0)
  const log = controllerLog(g)
  return (
    <section id="health" className="gh-section">
      <h2 className="gh-h2">Greenhouse health</h2>
      <div className="gh-health-grid">
        <div className="gh-card gh-overall">
          <HealthRings health={summary.avgHealth} a={Math.round((summary.healthy / summary.plantCount) * 100)} b={summary.mineralsInRange} />
          <ul className="gh-ring-key">
            <li>
              <i style={{ background: '#5b9a3c' }} />
              Average plant health
            </li>
            <li>
              <i style={{ background: '#f0b43a' }} />
              Plants doing well
            </li>
            <li>
              <i style={{ background: '#6cb7dd' }} />
              Soil minerals in range
            </li>
          </ul>
        </div>
        <div className="gh-stats">
          <Stat label="Plants monitored" value={summary.plantCount} sub="1 probe each" />
          <Stat label="Doing well" value={summary.healthy} tone="ok" />
          <Stat label="Keep an eye" value={summary.watch} tone={summary.watch ? 'warn' : undefined} />
          <Stat label="Need a person" value={summary.alertPlants} tone={summary.alertPlants ? 'bad' : 'ok'} sub="soil minerals" />
          <Stat label="Avg soil moisture" value={`${summary.avgMoisture}%`} sub="auto-watered" />
          <Stat label="Climate in range" value={`${summary.climateInRange}%`} sub="3 of 3 zones" tone="ok" />
        </div>
      </div>

      <h3 className="gh-h3">Zones: larger air sensors</h3>
      <div className="gh-zones">
        {ZONES.map((z) => {
          const hub = g.hubs.find((h) => h.zone === z.id)!
          const inZone = g.plants.filter((p) => p.zone === z.id)
          const avg = Math.round(inZone.reduce((a, p) => a + p.health, 0) / inZone.length)
          return (
            <button key={z.id} type="button" className="gh-card gh-zone" onClick={() => onHub(z.id)}>
              <div className="gh-zone-head">
                <b>Zone {z.id}</b>
                <span>{z.name}</span>
                <i style={{ color: avg >= 92 ? STATUS_COLOR.great : avg >= 82 ? STATUS_COLOR.good : STATUS_COLOR.watch }}>{avg}</i>
              </div>
              <p>{z.tagline}</p>
              <dl>
                <div><dt>CO₂</dt><dd>{hub.metrics.co2_ppm} ppm</dd></div>
                <div><dt>Dust</dt><dd>{hub.metrics.pm2_5.toFixed(1)} ug/m3</dd></div>
                <div><dt>Temp</dt><dd>{hub.metrics.temp_c.toFixed(1)}°C</dd></div>
                <div><dt>Humidity</dt><dd>{hub.metrics.rh_pct.toFixed(0)}%</dd></div>
              </dl>
              <span className="gh-zone-foot">
                Vents {hub.ventPct}% · Misting {hub.mistOn ? 'on' : 'idle'} · {inZone.length} plants
              </span>
            </button>
          )
        })}
      </div>

      <div className="gh-two">
        <div className="gh-card">
          <h3 className="gh-h3">Needs a person ({needs.length})</h3>
          <p className="gh-note">Everything else is handled automatically. These are problems the controller can't fix from here.</p>
          {needs.length === 0 && <p className="gh-empty">Nothing needs you right now.</p>}
          <ul className="gh-todo">
            {needs.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onPlant(p.id)}>
                  <Sprite plantTypeId={p.typeId} spriteRef={p.type.sprite_ref} />
                  <span>
                    <b>
                      {p.type.common_names[0]} · {p.id}
                    </b>
                    <em>{p.alerts.map((a) => a.label).join(' · ')}</em>
                    <small>{adviceFor(p.type, p.alerts[0])}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="gh-card">
          <h3 className="gh-h3">Controller activity</h3>
          <p className="gh-note">What the biosphere controller did on its own (simulated).</p>
          <ul className="gh-log">
            {log.map((a, i) => (
              <li key={i}>
                <time>{a.minutesAgo} min ago</time>
                <span className="gh-zone-tag">{a.zone === 'ALL' ? 'ALL' : `Zone ${a.zone}`}</span>
                {a.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Bar({ value, status }: { value: number; status: Status }) {
  return (
    <span className="gh-bar" aria-hidden="true">
      <i style={{ width: `${Math.max(4, Math.min(100, value))}%`, background: STATUS_COLOR[status] }} />
    </span>
  )
}

export function TypeSection({ types, focusType, onFocus }: { types: TypeSummary[]; focusType: string | null; onFocus: (id: string | null) => void }) {
  return (
    <section id="types" className="gh-section">
      <h2 className="gh-h2">Health by plant type</h2>
      <p className="gh-note">Each type has its own healthy ranges for soil, minerals and climate. Pick one to highlight it on the map and filter the list below.</p>
      <div className="gh-types">
        {types.map((t) => {
          const on = focusType === t.typeId
          return (
            <button key={t.typeId} type="button" className={`gh-card gh-type${on ? ' on' : ''}`} onClick={() => onFocus(on ? null : t.typeId)} aria-pressed={on}>
              <div className="gh-type-head">
                <Sprite plantTypeId={t.typeId} spriteRef={t.type.sprite_ref} />
                <div>
                  <b>{t.type.common_names[0]}</b>
                  <span>
                    {t.count} plant{t.count === 1 ? '' : 's'} · zone {t.zones.join(', ')}
                  </span>
                </div>
                <strong style={{ color: STATUS_COLOR[t.status] }}>{t.avgHealth}</strong>
              </div>
              <Bar value={t.avgHealth} status={t.status} />
              <dl>
                <div>
                  <dt>Soil moisture</dt>
                  <dd>{t.avgMoisture}%</dd>
                </div>
                <div>
                  <dt>Minerals in range</dt>
                  <dd>{t.mineralsInRange}%</dd>
                </div>
              </dl>
              {t.alerts > 0 ? <span className="gh-badge bad">{t.alerts} need{t.alerts === 1 ? 's' : ''} a person</span> : <span className="gh-badge ok">All in range</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function PlantsSection({
  plants,
  focusType,
  onFocus,
  onlyAlerts,
  onOnlyAlerts,
  onPlant,
}: {
  plants: PlantRecord[]
  focusType: string | null
  onFocus: (id: string | null) => void
  onlyAlerts: boolean
  onOnlyAlerts: (v: boolean) => void
  onPlant: (id: string) => void
}) {
  const shown = plants.filter((p) => (focusType ? p.typeId === focusType : true) && (onlyAlerts ? p.alerts.length > 0 : true))
  return (
    <section id="plants" className="gh-section">
      <h2 className="gh-h2">Every plant</h2>
      <div className="gh-filters">
        <button type="button" className={!focusType ? 'on' : ''} onClick={() => onFocus(null)}>
          All types
        </button>
        {PLANT_TYPES.map((t) => (
          <button key={t.plant_type_id} type="button" className={focusType === t.plant_type_id ? 'on' : ''} onClick={() => onFocus(focusType === t.plant_type_id ? null : t.plant_type_id)}>
            {t.common_names[0]}
          </button>
        ))}
        <label className="gh-check">
          <input type="checkbox" checked={onlyAlerts} onChange={(e) => onOnlyAlerts(e.target.checked)} /> Only plants that need me
        </label>
      </div>
      <p className="gh-note">
        Showing {shown.length} of {plants.length} plants
      </p>
      <div className="gh-plants">
        {shown.map((p) => (
          <button key={p.id} type="button" className={`gh-card gh-plantcard status-${p.status}`} onClick={() => onPlant(p.id)}>
            <div className="gh-plantcard-head">
              <Sprite plantTypeId={p.typeId} spriteRef={p.type.sprite_ref} />
              <div>
                <b>{p.type.common_names[0]}</b>
                <span>Bed {p.id}</span>
              </div>
              <strong style={{ color: STATUS_COLOR[p.status] }}>{p.health}</strong>
            </div>
            <RangeMeter label="Moisture" value={p.soil.moisture.value} min={p.soil.moisture.min} max={p.soil.moisture.max} unit="%" digits={0} hint=" " />
            <RangeMeter label="Minerals" value={p.soil.minerals.value} min={p.soil.minerals.min} max={p.soil.minerals.max} unit="" hint=" " />
            <StatusChip status={p.status} />
          </button>
        ))}
        {shown.length === 0 && <p className="gh-empty">No plants match.</p>}
      </div>
    </section>
  )
}
