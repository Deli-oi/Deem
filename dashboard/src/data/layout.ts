/**
 * The greenhouse floor plan. Everything is in map tiles (16px each on the 72 x 40 canvas).
 * Three climate zones, each with three raised beds of five plants and one air-quality hub.
 */
export const TILE = 16
export const MAP_COLS = 72
export const MAP_ROWS = 40

/** Each plant sprite stands in a 4 x 4 tile box. */
export const PLANT_TILES = 4
export const COLS_PER_BED = 5
/** Top tile row of each bed; the trough sits under the plants. */
export const BED_Y = [10, 17, 24] as const

export type ZoneId = 'A' | 'B' | 'C'

export type Zone = {
  id: ZoneId
  name: string
  tagline: string
  /** Left tile column of the zone. Zones are 20 tiles wide with a 2 tile aisle between. */
  x0: number
  /** Where the zone's air-quality hub stands (top-left tile; 2 x 4 tiles). */
  hub: { x: number; y: number }
  /** What the zone's climate is held at (the simulated air readings are around these). */
  air: { temp_c: number; rh_pct: number; co2_ppm: number; pm2_5: number; pm10_0: number }
}

export const ZONES: Zone[] = [
  { id: 'A', name: 'Arid & bright', tagline: 'Succulents and sturdy upright plants', x0: 4, hub: { x: 13, y: 4 }, air: { temp_c: 27, rh_pct: 42, co2_ppm: 640, pm2_5: 6, pm10_0: 14 } },
  { id: 'B', name: 'Humid tropics', tagline: 'Broadleaf plants that like it damp', x0: 26, hub: { x: 35, y: 4 }, air: { temp_c: 24.5, rh_pct: 68, co2_ppm: 760, pm2_5: 9, pm10_0: 20 } },
  { id: 'C', name: 'Foliage & trailing', tagline: 'Easy foliage, vines and spiders', x0: 48, hub: { x: 57, y: 4 }, air: { temp_c: 22.5, rh_pct: 55, co2_ppm: 700, pm2_5: 5, pm10_0: 12 } },
]

/** Plant type in each spot, row by row, five per bed. Counts: 45 plants across the 12 types. */
export const ZONE_PLANTS: Record<ZoneId, string[]> = {
  A: [
    'aloe_vera', 'aloe_vera', 'aloe_vera', 'panda_plant', 'panda_plant',
    'panda_plant', 'snake_plant', 'snake_plant', 'snake_plant', 'snake_plant',
    'zz_plant', 'zz_plant', 'zz_plant', 'zz_plant', 'dracaena',
  ],
  B: [
    'peace_lily', 'peace_lily', 'peace_lily', 'peace_lily', 'monstera',
    'monstera', 'monstera', 'monstera', 'golden_pothos', 'golden_pothos',
    'golden_pothos', 'golden_pothos', 'heartleaf_philodendron', 'heartleaf_philodendron', 'heartleaf_philodendron',
  ],
  C: [
    'spider_plant', 'spider_plant', 'spider_plant', 'spider_plant', 'rubber_plant',
    'rubber_plant', 'rubber_plant', 'chinese_evergreen', 'chinese_evergreen', 'chinese_evergreen',
    'dracaena', 'dracaena', 'dracaena', 'dracaena', 'golden_pothos',
  ],
}

/**
 * Plants whose soil minerals (EC) are off, to show what needs a human. Everything else the
 * biosphere controller keeps in range on its own (watering, climate, ventilation).
 */
export const SOIL_ISSUES: Record<string, 'low' | 'high'> = {
  'A-2-3': 'low',
  'A-3-1': 'high',
  'B-1-2': 'low',
  'B-3-4': 'high',
  'C-2-4': 'low',
}

export function plantTile(zone: Zone, row: number, col: number) {
  return { x: zone.x0 + col * PLANT_TILES, y: BED_Y[row] }
}

/** Where things sit on the map, in tiles (used by the drawing and by the clickable overlays). */
export const FEATURES = {
  tanks: { x: 5, y: 5, w: 5, h: 4 },
  desk: { x: 61, y: 5, w: 7, h: 4 },
  shelf: { x: 5, y: 32, w: 12, h: 4 },
  pallet: { x: 56, y: 32, w: 11, h: 4 },
  door: { x: 33, y: 37, w: 6, h: 1 },
}
