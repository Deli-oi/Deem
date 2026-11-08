import { evaluateAlerts } from '../shared/lib/alerts'
import type { Alert } from '../shared/lib/alerts'
import seed from '../shared/plants/seed_all.json'
import type { HealthPoint, PlantType, Telemetry } from '../shared/lib/types'
import { AUTO_CORRECTED, plantHealth, statusFor } from '../lib/health'
import type { Status } from '../lib/health'
import { BED_Y, COLS_PER_BED, SOIL_ISSUES, ZONES, ZONE_PLANTS, plantTile } from './layout'
import type { ZoneId } from './layout'

/**
 * All simulated. Every reading is a pure function of the time, so the same moment always shows
 * the same greenhouse (screens and tests are repeatable) while it still drifts like a live one.
 */
export const PLANT_TYPES = seed as unknown as PlantType[]
const TYPE_BY_ID = new Map(PLANT_TYPES.map((p) => [p.plant_type_id, p]))
export const typeById = (id: string) => TYPE_BY_ID.get(id) as PlantType

export type Range = { value: number; min: number; max: number }

export type SoilQuality = { moisture: Range; minerals: Range; temp: Range }

export type PlantRecord = {
  id: string
  typeId: string
  type: PlantType
  zone: ZoneId
  row: number
  col: number
  tile: { x: number; y: number }
  metrics: Record<string, number>
  telemetry: Telemetry
  alerts: Alert[]
  health: number
  status: Status
  soil: SoilQuality
  history: HealthPoint[]
  /** true for the one plant that shows the real pot's readings */
  live?: boolean
}

export type AirMetrics = { co2_ppm: number; pm2_5: number; pm10_0: number; temp_c: number; rh_pct: number }

export type AirHub = { zone: ZoneId; metrics: AirMetrics; ventPct: number; mistOn: boolean }

export type Greenhouse = { now: number; plants: PlantRecord[]; hubs: AirHub[] }

// ---------- deterministic randomness ----------

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d
const wave = (tSec: number, periodSec: number, phase: number) => Math.sin((tSec / periodSec) * 2 * Math.PI + phase)

type Spec = {
  id: string
  typeId: string
  zone: ZoneId
  row: number
  col: number
  phase: number
  // where this plant sits inside its healthy ranges (-1 .. 1, 0 = the middle)
  moist: number
  temp: number
  rh: number
  ec: number
  soilTemp: number
  issue?: 'low' | 'high'
}

function buildSpecs(): Spec[] {
  const rng = mulberry32(2026)
  const specs: Spec[] = []
  for (const zone of ZONES) {
    ZONE_PLANTS[zone.id].forEach((typeId, i) => {
      const row = Math.floor(i / COLS_PER_BED)
      const col = i % COLS_PER_BED
      const id = `${zone.id}-${row + 1}-${col + 1}`
      const pick = () => (rng() + rng() - 1) * 1.05 // bell-shaped, spread through the healthy range
      specs.push({
        id,
        typeId,
        zone: zone.id,
        row,
        col,
        phase: rng() * Math.PI * 2,
        moist: pick(),
        temp: pick() * 0.5,
        rh: pick() * 0.5,
        ec: pick() * 0.8,
        soilTemp: pick(),
        issue: SOIL_ISSUES[id],
      })
    })
  }
  return specs
}

const SPECS = buildSpecs()

// ---------- readings ----------

function hubMetrics(zoneId: ZoneId, tSec: number): AirMetrics {
  const zone = ZONES.find((z) => z.id === zoneId)!
  const ph = zoneId.charCodeAt(0)
  return {
    co2_ppm: Math.round(zone.air.co2_ppm + 45 * wave(tSec, 5400, ph) + 12 * wave(tSec, 110, ph * 2)),
    pm2_5: round(zone.air.pm2_5 + 1.2 * wave(tSec, 7200, ph) + 0.3 * wave(tSec, 95, ph), 1),
    pm10_0: round(zone.air.pm10_0 + 2 * wave(tSec, 7200, ph + 1) + 0.5 * wave(tSec, 85, ph), 1),
    temp_c: round(zone.air.temp_c + 0.5 * wave(tSec, 86400, ph) + 0.08 * wave(tSec, 100, ph), 1),
    rh_pct: round(zone.air.rh_pct + 2.5 * wave(tSec, 21600, ph) + 0.4 * wave(tSec, 120, ph), 1),
  }
}

function range(plant: PlantType, key: string) {
  const r = plant.thresholds[key as keyof PlantType['thresholds']] as { min: number | null; max: number | null } | undefined
  return { min: r?.min ?? 0, max: r?.max ?? 100 }
}

function metricsFor(spec: Spec, tSec: number): Record<string, number> {
  const plant = typeById(spec.typeId)
  const air = hubMetrics(spec.zone, tSec)
  const at = (key: string, pos: number) => {
    const { min, max } = range(plant, key)
    return (min + max) / 2 + pos * ((max - min) / 2)
  }
  const ph = spec.phase
  const ec = range(plant, 'soil_ec')
  let soilEc = at('soil_ec', Math.max(-0.88, Math.min(0.88, spec.ec + 0.04 * wave(tSec, 43200, ph))))
  if (spec.issue === 'low') soilEc = ec.min * (0.55 + 0.04 * wave(tSec, 5000, ph)) // starved of minerals
  if (spec.issue === 'high') soilEc = ec.max * (1.28 + 0.04 * wave(tSec, 5000, ph)) // over-fertilized
  return {
    // watering, climate and air are held in range by the controller
    soil_moisture: round(at('soil_moisture', Math.max(-0.9, Math.min(0.9, spec.moist * 0.9 + 0.1 * wave(tSec, 21600, ph) + 0.012 * wave(tSec, 100, ph)))), 1),
    temp_c: round(air.temp_c + spec.temp * 1.2 + 0.15 * wave(tSec, 80, ph), 1),
    rh_pct: round(air.rh_pct + spec.rh * 4, 1),
    co2_ppm: air.co2_ppm,
    pm2_5: air.pm2_5,
    pm10_0: air.pm10_0,
    soil_temp_c: round(21 + spec.soilTemp * 2.2 + 0.4 * wave(tSec, 43200, ph) + 0.15 * wave(tSec, 70, ph), 1),
    soil_ec: Math.round(soilEc),
  }
}

/** Local-time hour key, the format the device's history chart uses: "2026-11-07 16". */
export function hourKey(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}`
}

function recordFor(spec: Spec, nowMs: number): PlantRecord {
  const type = typeById(spec.typeId)
  const zone = ZONES.find((z) => z.id === spec.zone)!
  const tSec = Math.floor(nowMs / 1000)
  const metrics = metricsFor(spec, tSec)
  const alerts = evaluateAlerts(type, metrics, AUTO_CORRECTED)
  const health = plantHealth(type, metrics)

  const history: HealthPoint[] = []
  for (let h = 23; h >= 0; h--) {
    const t = tSec - h * 3600
    history.push({ hour: hourKey(t), avg_health: plantHealth(type, metricsFor(spec, t)) })
  }

  const telemetry: Telemetry = {
    device_id: `probe-${spec.id}`,
    ts: tSec,
    received_ts: tSec,
    fw: 'sim',
    metrics,
    health_score: alerts.length > 0 ? Math.min(health, 64) : health,
  }
  const ecRange = range(type, 'soil_ec')
  const moist = range(type, 'soil_moisture')
  return {
    id: spec.id,
    typeId: spec.typeId,
    type,
    zone: spec.zone,
    row: spec.row,
    col: spec.col,
    tile: plantTile(zone, spec.row, spec.col),
    metrics,
    telemetry,
    alerts,
    health: telemetry.health_score as number,
    status: statusFor(health, alerts),
    soil: {
      moisture: { value: metrics.soil_moisture, ...moist },
      minerals: { value: metrics.soil_ec, ...ecRange },
      temp: { value: metrics.soil_temp_c, min: 14, max: 30 },
    },
    history,
  }
}

export function greenhouseAt(nowMs: number): Greenhouse {
  const tSec = Math.floor(nowMs / 1000)
  return {
    now: nowMs,
    plants: SPECS.map((s) => recordFor(s, nowMs)),
    hubs: ZONES.map((z) => {
      const metrics = hubMetrics(z.id, tSec)
      return {
        zone: z.id,
        metrics,
        ventPct: Math.round(Math.max(12, Math.min(90, (metrics.co2_ppm - 560) / 3))),
        mistOn: metrics.rh_pct < z.air.rh_pct - 0.5,
      }
    }),
  }
}

// ---------- rollups ----------

export type Summary = {
  plantCount: number
  alertPlants: number
  alertCount: number
  watch: number
  healthy: number
  avgHealth: number
  avgMoisture: number
  mineralsInRange: number
  climateInRange: number
}

export function summarize(g: Greenhouse): Summary {
  const n = g.plants.length
  const alertPlants = g.plants.filter((p) => p.alerts.length > 0).length
  const mineralOk = g.plants.filter((p) => p.soil.minerals.value >= p.soil.minerals.min && p.soil.minerals.value <= p.soil.minerals.max).length
  return {
    plantCount: n,
    alertPlants,
    alertCount: g.plants.reduce((a, p) => a + p.alerts.length, 0),
    watch: g.plants.filter((p) => p.status === 'watch').length,
    healthy: g.plants.filter((p) => p.status === 'great' || p.status === 'good').length,
    avgHealth: Math.round(g.plants.reduce((a, p) => a + p.health, 0) / n),
    avgMoisture: round(g.plants.reduce((a, p) => a + p.metrics.soil_moisture, 0) / n, 1),
    mineralsInRange: Math.round((mineralOk / n) * 100),
    climateInRange: 100, // the controller holds every zone's climate in range
  }
}

export type TypeSummary = {
  typeId: string
  type: PlantType
  count: number
  avgHealth: number
  alerts: number
  avgMoisture: number
  mineralsInRange: number
  status: Status
  zones: ZoneId[]
}

export function summarizeByType(g: Greenhouse): TypeSummary[] {
  return PLANT_TYPES.map((type) => {
    const ps = g.plants.filter((p) => p.typeId === type.plant_type_id)
    const alerts = ps.reduce((a, p) => a + p.alerts.length, 0)
    const avgHealth = ps.length ? Math.round(ps.reduce((a, p) => a + p.health, 0) / ps.length) : 0
    const ok = ps.filter((p) => p.soil.minerals.value >= p.soil.minerals.min && p.soil.minerals.value <= p.soil.minerals.max).length
    return {
      typeId: type.plant_type_id,
      type,
      count: ps.length,
      avgHealth,
      alerts,
      avgMoisture: ps.length ? round(ps.reduce((a, p) => a + p.metrics.soil_moisture, 0) / ps.length, 1) : 0,
      mineralsInRange: ps.length ? Math.round((ok / ps.length) * 100) : 100,
      status: statusFor(avgHealth, alerts > 0 ? [{} as Alert] : []),
      zones: [...new Set(ps.map((p) => p.zone))],
    }
  }).filter((t) => t.count > 0)
}

export type ControllerAction = { minutesAgo: number; zone: ZoneId | 'ALL'; text: string }

/** What the biosphere controller did on its own recently (simulated). */
export function controllerLog(g: Greenhouse): ControllerAction[] {
  const hubB = g.hubs.find((h) => h.zone === 'B')!
  const hubA = g.hubs.find((h) => h.zone === 'A')!
  return [
    { minutesAgo: 2, zone: 'B', text: `Vents at ${hubB.ventPct}% to hold CO2 near ${Math.round(hubB.metrics.co2_ppm / 10) * 10} ppm` },
    { minutesAgo: 6, zone: 'A', text: `Misting ran 40 s (humidity ${round(hubA.metrics.rh_pct - 2.1, 0)}% to ${round(hubA.metrics.rh_pct, 0)}%)` },
    { minutesAgo: 11, zone: 'A', text: 'Irrigated bed A-2 (120 ml per plant)' },
    { minutesAgo: 19, zone: 'C', text: 'Shade cloth drawn 30% for the afternoon sun' },
    { minutesAgo: 27, zone: 'B', text: 'Irrigated bed B-1 and B-3 (90 ml per plant)' },
    { minutesAgo: 41, zone: 'ALL', text: 'Air filters swept: particulates steady' },
    { minutesAgo: 58, zone: 'C', text: 'Heat mat on in bed C-3 (soil 19 C to 21 C)' },
    { minutesAgo: 74, zone: 'A', text: 'Irrigated bed A-1 and A-3 (60 ml per plant, succulents)' },
  ]
}

export { BED_Y }
