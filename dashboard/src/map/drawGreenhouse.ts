import { BED_Y, FEATURES, MAP_COLS, MAP_ROWS, TILE, ZONES } from '../data/layout'

/**
 * Draws the greenhouse floor as top-down pixel art onto a canvas of MAP_COLS x MAP_ROWS tiles.
 * Everything except the plants (clickable sprites laid on top by the map component) is drawn here.
 * Pure drawing: no state, deterministic.
 */

const C = {
  grassA: '#1e4a2a',
  grassB: '#245733',
  grassC: '#1a4026',
  floorA: '#5f7f66',
  floorB: '#587a60',
  grout: '#46634e',
  walk: '#88a18a',
  walkB: '#7e9880',
  soil: '#4a2e1c',
  soilB: '#5c3a24',
  wood: '#9a6a3c',
  woodD: '#76502c',
  woodL: '#b88450',
  pipe: '#4aa0e8',
  pipeL: '#8ad0ff',
  frame: '#a8d4c8',
  frameD: '#5f8f84',
  glass: 'rgba(150, 215, 205, 0.20)',
  glassHi: 'rgba(235, 255, 250, 0.22)',
  shadow: 'rgba(0, 0, 0, 0.28)',
  steel: '#8794a0',
  steelD: '#4b5662',
  steelL: '#c4ced6',
  led: '#7dff9a',
}

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function drawGreenhouse(ctx: CanvasRenderingContext2D) {
  const rng = mulberry32(11)
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  }
  const tile = (tx: number, ty: number, tw: number, th: number, color: string) => px(tx * TILE, ty * TILE, tw * TILE, th * TILE, color)
  ctx.imageSmoothingEnabled = false

  // ---- grass outside ----
  px(0, 0, MAP_COLS * TILE, MAP_ROWS * TILE, C.grassA)
  for (let i = 0; i < 1400; i++) {
    px(rng() * MAP_COLS * TILE, rng() * MAP_ROWS * TILE, 2 + (rng() < 0.3 ? 2 : 0), 2, rng() < 0.5 ? C.grassB : C.grassC)
  }

  // ---- floor: tiled, with grout and the odd crack ----
  const [fx0, fy0, fx1, fy1] = [3, 3, 69, 37]
  for (let ty = fy0; ty < fy1; ty++) {
    for (let tx = fx0; tx < fx1; tx++) {
      tile(tx, ty, 1, 1, (tx + ty) % 2 ? C.floorA : C.floorB)
      px(tx * TILE, ty * TILE, TILE, 1, C.grout)
      px(tx * TILE, ty * TILE, 1, TILE, C.grout)
      if (rng() < 0.05) px(tx * TILE + 3 + rng() * 8, ty * TILE + 3 + rng() * 8, 3, 1, C.grout)
    }
  }

  // a soft tint per zone, so the three climates read at a glance
  const tints = ['rgba(255, 214, 140, 0.10)', 'rgba(120, 225, 205, 0.10)', 'rgba(170, 240, 150, 0.10)']
  ZONES.forEach((z, i) => {
    ctx.fillStyle = tints[i]
    ctx.fillRect(z.x0 * TILE - 8, 9 * TILE, 20 * TILE + 16, 22 * TILE)
  })

  // walkways: the two aisles between zones and the cross aisle at the front
  const walk = (tx: number, ty: number, tw: number, th: number) => {
    for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) tile(x, y, 1, 1, (x + y) % 2 ? C.walk : C.walkB)
  }
  walk(24, 9, 2, 22)
  walk(46, 9, 2, 22)
  walk(4, 30, 64, 2)
  for (let y = 9 * TILE; y < 31 * TILE; y += 12) {
    px(25 * TILE - 1, y, 2, 6, '#b9cdb9')
    px(47 * TILE - 1, y, 2, 6, '#b9cdb9')
  }

  // sun coming through the glass: diagonal light bands across the floor
  ctx.save()
  ctx.beginPath()
  ctx.rect(fx0 * TILE, fy0 * TILE, (fx1 - fx0) * TILE, (fy1 - fy0) * TILE)
  ctx.clip()
  ctx.fillStyle = 'rgba(255, 250, 200, 0.055)'
  for (let k = -10; k < 26; k++) {
    ctx.beginPath()
    ctx.moveTo(k * 56, 0)
    ctx.lineTo(k * 56 + 26, 0)
    ctx.lineTo(k * 56 + 26 + MAP_ROWS * TILE * 0.7, MAP_ROWS * TILE)
    ctx.lineTo(k * 56 + MAP_ROWS * TILE * 0.7, MAP_ROWS * TILE)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // ---- raised beds: wooden trough with a soil top, and an irrigation pipe along the front ----
  for (const z of ZONES) {
    for (const by of BED_Y) {
      const x = z.x0 * TILE
      const w = 20 * TILE
      const top = (by + 3) * TILE
      px(x - 4, top + 2 * TILE - 2, w + 8, 9, C.shadow) // shadow on the floor
      px(x - 4, top - 2, w + 8, TILE + 6, C.woodD) // top rim
      px(x, top + 2, w, TILE + 2, C.soil)
      for (let i = 0; i < 90; i++) px(x + rng() * w, top + 2 + rng() * (TILE + 2), 2, 1, C.soilB)
      px(x - 4, top + TILE + 4, w + 8, TILE - 4, C.wood) // front planks
      for (let k = 0; k <= 20; k++) px(x + k * TILE - 1, top + TILE + 4, 2, TILE - 4, C.woodD)
      px(x - 4, top + TILE + 4, w + 8, 2, C.woodL)
      // irrigation pipe with drip points
      px(x - 8, top + 2 * TILE + 1, w + 16, 3, C.pipe)
      px(x - 8, top + 2 * TILE + 1, w + 16, 1, C.pipeL)
      for (let k = 0; k < 20; k += 2) px(x + k * TILE + 6, top + 2 * TILE + 4, 2, 3, C.pipeL)
    }
  }

  // ---- ceiling mist line and fans along the top of each zone ----
  for (const z of ZONES) {
    px(z.x0 * TILE - 8, 8 * TILE + 2, 20 * TILE + 16, 3, C.steel)
    px(z.x0 * TILE - 8, 8 * TILE + 2, 20 * TILE + 16, 1, C.steelL)
    for (let k = 1; k < 20; k += 3) {
      px(z.x0 * TILE + k * TILE, 8 * TILE + 5, 2, 3, C.steelD)
      ctx.fillStyle = 'rgba(235, 250, 255, 0.35)'
      for (let m = 0; m < 4; m++) ctx.fillRect(z.x0 * TILE + k * TILE + (rng() - 0.5) * 8, 8 * TILE + 9 + m * 3, 1, 1)
    }
    for (const fx of [z.x0 + 4, z.x0 + 16]) {
      const cx = fx * TILE
      const cy = 6 * TILE + 8
      px(cx - 14, cy - 3, 28, 6, 'rgba(0,0,0,0.18)') // blur of the blades
      px(cx - 13, cy - 2, 26, 4, C.steelD)
      px(cx - 2, cy - 13, 4, 26, C.steelD)
      px(cx - 13, cy - 2, 26, 1, C.steelL)
      px(cx - 4, cy - 4, 8, 8, C.steel)
      px(cx - 2, cy - 2, 4, 4, C.steelL)
    }
  }

  // ---- water tanks (top-left) with a pipe running to the beds ----
  const t = FEATURES.tanks
  px((t.x + 0.4) * TILE, (t.y + 3.1) * TILE, t.w * TILE, 8, C.shadow)
  for (let i = 0; i < 3; i++) {
    const bx = (t.x + i * 1.7) * TILE + 2
    const by = (t.y + 0.3) * TILE
    px(bx, by + 4, 26, 42, '#2f6fb8')
    px(bx + 2, by + 4, 6, 42, '#5fa0e6')
    px(bx + 20, by + 4, 6, 42, '#245591')
    px(bx, by + 14, 26, 3, '#1c3f70')
    px(bx, by + 32, 26, 3, '#1c3f70')
    px(bx + 1, by, 24, 8, '#8cc2f4')
    px(bx + 5, by + 2, 16, 4, '#2f6fb8')
    px(bx + 11, by - 3, 4, 5, C.steelD)
  }
  px((t.x + t.w) * TILE - 6, (t.y + 2) * TILE, 14 * TILE, 3, C.pipe)
  px((t.x + t.w) * TILE - 6, (t.y + 2) * TILE, 14 * TILE, 1, C.pipeL)

  // ---- control desk (top-right) ----
  const d = FEATURES.desk
  px(d.x * TILE, (d.y + 1.2) * TILE, d.w * TILE, 8, C.shadow)
  px(d.x * TILE, d.y * TILE + 6, d.w * TILE, 3 * TILE - 12, '#414c58')
  px(d.x * TILE, d.y * TILE + 6, d.w * TILE, 4, '#6a7886')
  for (let i = 0; i < 2; i++) {
    const mx = (d.x + 0.6 + i * 3.1) * TILE
    px(mx, d.y * TILE + 12, 44, 30, '#10181a')
    px(mx + 3, d.y * TILE + 15, 38, 22, '#0c2a1c')
    for (let l = 0; l < 4; l++) px(mx + 6, d.y * TILE + 18 + l * 5, 10 + rng() * 22, 2, C.led)
    px(mx + 18, d.y * TILE + 42, 8, 4, C.steelD)
  }
  px((d.x + 0.8) * TILE, (d.y + 2.35) * TILE, 36, 6, '#2b3340')
  px((d.x + 5.4) * TILE, (d.y + 2.1) * TILE, 8, 9, '#e8d9b0') // a mug

  // ---- potting shelf (bottom-left) ----
  const s = FEATURES.shelf
  px(s.x * TILE, (s.y + 3.2) * TILE, s.w * TILE, 6, C.shadow)
  for (let r = 0; r < 2; r++) {
    px(s.x * TILE, (s.y + r * 1.8) * TILE + 20, s.w * TILE, 6, C.wood)
    px(s.x * TILE, (s.y + r * 1.8) * TILE + 20, s.w * TILE, 2, C.woodL)
    for (let k = 0; k < 7; k++) {
      const x = (s.x + 0.4 + k * 1.6) * TILE
      const y = (s.y + r * 1.8) * TILE + 20
      if ((k + r) % 3 === 2) {
        px(x + 2, y - 10, 14, 10, '#3f9a52') // watering can
        px(x + 14, y - 14, 6, 3, '#3f9a52')
      } else {
        px(x, y - 12, 18, 12, '#c4693e')
        px(x - 1, y - 14, 20, 4, '#dd8a5c')
        px(x + 3, y - 18, 12, 5, '#3f7a3c')
      }
    }
  }
  px(s.x * TILE, s.y * TILE, 3, 3 * TILE + 2, C.woodD)
  px((s.x + s.w) * TILE - 3, s.y * TILE, 3, 3 * TILE + 2, C.woodD)

  // ---- fertilizer pallet (bottom-right) ----
  const p = FEATURES.pallet
  px(p.x * TILE, (p.y + 3.1) * TILE, p.w * TILE, 6, C.shadow)
  px(p.x * TILE, (p.y + 2.4) * TILE, p.w * TILE, 14, C.woodD)
  for (let k = 0; k < 6; k++) px(p.x * TILE + k * 31, (p.y + 2.4) * TILE, 3, 14, '#4e3416')
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 5; k++) {
      const x = (p.x + 0.3 + k * 2) * TILE
      const y = (p.y + 0.6 + r * 1.0) * TILE
      px(x, y, 28, 26, '#e3d4a4')
      px(x, y, 28, 3, '#f2e8c4')
      px(x + 6, y + 8, 16, 10, '#3f9a52')
      px(x + 10, y + 11, 8, 4, '#e3d4a4')
    }
  }

  // ---- front door and mat ----
  const dr = FEATURES.door
  px((dr.x - 0.5) * TILE, 36 * TILE + 2, (dr.w + 1) * TILE, 10, '#6b3f26')
  px(dr.x * TILE, 37 * TILE, dr.w * TILE, TILE, '#16301f')
  px((dr.x + 1) * TILE, 35 * TILE + 2, (dr.w - 2) * TILE, 12, '#3a5e86')
  px((dr.x + 1) * TILE + 2, 35 * TILE + 4, (dr.w - 2) * TILE - 4, 3, '#6a95c4')

  // ---- air-quality hubs: a pole with a sensor box (clickable overlays sit on top) ----
  for (const z of ZONES) {
    const hx = z.hub.x * TILE
    const hy = z.hub.y * TILE
    px(hx + 12, hy + 28, 8, 4 * TILE, C.steelD)
    px(hx + 12, hy + 28, 2, 4 * TILE, C.steel)
    px(hx + 4, hy + 4 * TILE + 24, 24, 5, C.shadow)
    px(hx, hy + 2, 32, 28, C.steelD)
    px(hx + 1, hy + 3, 30, 26, '#37424e')
    px(hx + 1, hy + 3, 30, 4, C.steelL)
    for (let v = 0; v < 4; v++) px(hx + 5, hy + 11 + v * 4, 14, 2, '#202a33')
    px(hx + 22, hy + 11, 6, 6, '#0c2a1c')
    px(hx + 23, hy + 12, 4, 4, C.led)
    px(hx + 22, hy + 21, 6, 4, '#ffb340')
  }

  // ---- glass walls: posts, panes, highlights ----
  const wall = (x: number, y: number, w: number, h: number, horizontal: boolean) => {
    px(x, y, w, h, C.frameD)
    ctx.fillStyle = C.glass
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4)
    ctx.fillStyle = C.glassHi
    if (horizontal) for (let k = 14; k < w; k += 70) ctx.fillRect(x + k, y + 2, 10, h - 4)
    else for (let k = 14; k < h; k += 70) ctx.fillRect(x + 2, y + k, w - 4, 10)
    px(x, y, w, 1, C.frame)
  }
  wall(2 * TILE, 2 * TILE, 68 * TILE, TILE, true) // back wall
  wall(2 * TILE, 37 * TILE, 31 * TILE + 8, TILE, true) // front wall, left of the door
  wall(39 * TILE - 8, 37 * TILE, 31 * TILE + 8, TILE, true) // front wall, right of the door
  wall(2 * TILE, 2 * TILE, TILE, 36 * TILE, false) // left wall
  wall(69 * TILE, 2 * TILE, TILE, 36 * TILE, false) // right wall
  for (let k = 2; k <= 70; k += 6) {
    px(k * TILE - 3, 2 * TILE, 6, 36 * TILE, 'rgba(0,0,0,0)')
    px(k * TILE - 3, 2 * TILE, 6, TILE, C.frame)
    px(k * TILE - 3, 37 * TILE, 6, TILE, C.frame)
  }
  for (let k = 2; k <= 37; k += 5) {
    px(2 * TILE, k * TILE - 3, TILE, 6, C.frame)
    px(69 * TILE, k * TILE - 3, TILE, 6, C.frame)
  }
  // roof vents along the back wall
  for (let k = 8; k < 66; k += 14) {
    px(k * TILE, 2 * TILE + 4, 5 * TILE, 6, C.steelD)
    px(k * TILE, 2 * TILE + 4, 5 * TILE, 2, C.steelL)
  }
}
