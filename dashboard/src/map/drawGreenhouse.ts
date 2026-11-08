import { BED_Y, FEATURES, MAP_COLS, MAP_ROWS, TILE, ZONES } from '../data/layout'

/**
 * Draws the greenhouse as cozy top-down pixel art (warm wood, soft stone, flowers) onto a canvas
 * of MAP_COLS x MAP_ROWS tiles. Everything except the plants (clickable sprites laid on top by the
 * map component) is drawn here. Pure drawing: no state, deterministic.
 */

const C = {
  grassA: '#86b858',
  grassB: '#7aae4e',
  grassC: '#6fa244',
  stoneA: '#e3d3ac',
  stoneB: '#dccaa0',
  grout: '#c2ac80',
  woodL: '#c99660',
  wood: '#b3804c',
  woodD: '#8a5c32',
  woodDD: '#5e3d20',
  plank: '#c08a54',
  plankB: '#b8824c',
  seam: '#8f6238',
  soil: '#5a3a24',
  soilB: '#6e4a2e',
  soilHi: '#80583a',
  copper: '#cf7a47',
  copperL: '#eba273',
  copperD: '#9a5530',
  teal: '#5fae9b',
  cream: '#f7f0df',
  creamD: '#dcceb0',
  creamDD: '#b8a782',
  glass: 'rgba(170, 222, 238, 0.26)',
  glassHi: 'rgba(255, 255, 255, 0.40)',
  shadow: 'rgba(70, 45, 20, 0.22)',
  lamp: '#ffe08a',
  leaf: '#4f9d3a',
  terra: '#c8693e',
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
  const rng = mulberry32(21)
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  }
  const tile = (tx: number, ty: number, tw: number, th: number, color: string) => px(tx * TILE, ty * TILE, tw * TILE, th * TILE, color)
  ctx.imageSmoothingEnabled = false

  // a round, soft bush (rows of rects), used for the corners outside
  const bush = (cx: number, cy: number, r: number) => {
    for (let y = -r; y <= r; y++) {
      const half = Math.round(Math.sqrt(r * r - y * y))
      px(cx - half, cy + y, half * 2, 1, y < -r / 3 ? '#5f9a3a' : '#4d8630')
    }
    for (let i = 0; i < r * 3; i++) px(cx - r * 0.6 + rng() * r * 1.1, cy - r * 0.6 + rng() * r * 0.8, 2, 2, '#7cb84d')
    px(cx - r * 0.5, cy - r * 0.55, 3, 2, '#a7d672')
  }

  // ---- grass outside, with tufts and wildflowers ----
  px(0, 0, MAP_COLS * TILE, MAP_ROWS * TILE, C.grassA)
  for (let i = 0; i < 1500; i++) {
    const x = rng() * MAP_COLS * TILE
    const y = rng() * MAP_ROWS * TILE
    px(x, y, 2 + (rng() < 0.3 ? 2 : 0), 2, rng() < 0.5 ? C.grassB : C.grassC)
    if (rng() < 0.25) {
      px(x, y - 3, 1, 3, C.grassC)
      px(x + 2, y - 4, 1, 4, C.grassC)
    }
  }
  const flowers = ['#f08fb0', '#fbf6e6', '#f5c94a', '#b69af0']
  const flower = (x: number, y: number, color: string) => {
    px(x, y - 3, 1, 3, '#4d8630')
    px(x - 1, y - 4, 3, 1, color)
    px(x - 1, y - 2, 3, 1, color)
    px(x, y - 5, 1, 1, color)
    px(x, y - 3, 1, 1, '#f5c94a')
  }
  const outside = (x: number, y: number) => x < 2 * TILE || x > 70 * TILE || y < 2 * TILE || y > 38 * TILE
  for (let i = 0; i < 260; i++) {
    const x = rng() * MAP_COLS * TILE
    const y = rng() * MAP_ROWS * TILE
    if (outside(x, y)) flower(x, y, flowers[Math.floor(rng() * flowers.length)])
  }
  bush(14, 16, 14)
  bush(MAP_COLS * TILE - 14, 18, 14)
  bush(18, MAP_ROWS * TILE - 14, 15)
  bush(MAP_COLS * TILE - 20, MAP_ROWS * TILE - 13, 14)
  bush(MAP_COLS * TILE - 52, MAP_ROWS * TILE - 9, 9)
  bush(60, MAP_ROWS * TILE - 8, 8)

  // a cobbled path from the front door
  for (let ty = 38; ty < MAP_ROWS; ty++) {
    for (let tx = 33; tx < 39; tx++) {
      tile(tx, ty, 1, 1, (tx + ty) % 2 ? '#e9dcb9' : '#e0d0a8')
      px(tx * TILE + 2, ty * TILE + 2, 5, 3, C.creamD)
      px(tx * TILE + 9, ty * TILE + 8, 5, 3, C.creamD)
    }
  }

  // ---- stone floor with grout, and a few little cracks ----
  const [fx0, fy0, fx1, fy1] = [3, 3, 69, 37]
  for (let ty = fy0; ty < fy1; ty++) {
    for (let tx = fx0; tx < fx1; tx++) {
      tile(tx, ty, 1, 1, (tx + ty) % 2 ? C.stoneA : C.stoneB)
      px(tx * TILE, ty * TILE, TILE, 1, C.grout)
      px(tx * TILE, ty * TILE, 1, TILE, C.grout)
      if (rng() < 0.07) px(tx * TILE + 3 + rng() * 8, ty * TILE + 4 + rng() * 8, 2 + rng() * 3, 1, C.grout)
      if (rng() < 0.03) px(tx * TILE + 4 + rng() * 8, ty * TILE + 4 + rng() * 8, 2, 2, '#a7d672') // moss
    }
  }

  // a soft pastel tint per zone so the three climates read at a glance
  const tints = ['rgba(255, 190, 140, 0.16)', 'rgba(130, 205, 215, 0.17)', 'rgba(190, 228, 120, 0.18)']
  ZONES.forEach((z, i) => {
    ctx.fillStyle = tints[i]
    ctx.fillRect(z.x0 * TILE - 8, 9 * TILE, 20 * TILE + 16, 22 * TILE)
  })

  // wooden boardwalks: the two aisles and the cross aisle at the front
  const boards = (tx: number, ty: number, tw: number, th: number, vertical: boolean) => {
    px(tx * TILE - 2, ty * TILE + 3, tw * TILE + 4, th * TILE, C.shadow)
    px(tx * TILE, ty * TILE, tw * TILE, th * TILE, C.plank)
    if (vertical) {
      for (let k = 0; k < tw * 2; k++) px(tx * TILE + k * 16, ty * TILE, 1, th * TILE, C.seam)
      for (let y = ty * TILE + 6; y < (ty + th) * TILE; y += 40) px(tx * TILE, y, tw * TILE, 1, C.seam)
    } else {
      for (let k = 0; k < th * 2; k++) px(tx * TILE, ty * TILE + k * 16, tw * TILE, 1, C.seam)
      for (let x = tx * TILE + 10; x < (tx + tw) * TILE; x += 44) px(x, ty * TILE, 1, th * TILE, C.seam)
    }
    for (let i = 0; i < tw * th * 3; i++) px(tx * TILE + rng() * tw * TILE, ty * TILE + rng() * th * TILE, 4, 1, C.plankB)
    px(tx * TILE, ty * TILE, tw * TILE, 2, C.woodL)
  }
  boards(24, 9, 2, 22, true)
  boards(46, 9, 2, 22, true)
  boards(4, 30, 64, 2, false)

  // warm sunlight through the glass
  ctx.save()
  ctx.beginPath()
  ctx.rect(fx0 * TILE, fy0 * TILE, (fx1 - fx0) * TILE, (fy1 - fy0) * TILE)
  ctx.clip()
  ctx.fillStyle = 'rgba(255, 244, 190, 0.13)'
  for (let k = -10; k < 26; k++) {
    ctx.beginPath()
    ctx.moveTo(k * 62, 0)
    ctx.lineTo(k * 62 + 30, 0)
    ctx.lineTo(k * 62 + 30 + MAP_ROWS * TILE * 0.7, MAP_ROWS * TILE)
    ctx.lineTo(k * 62 + MAP_ROWS * TILE * 0.7, MAP_ROWS * TILE)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // ---- wooden planter boxes: soil on top, planks in front, a copper drip line ----
  for (const z of ZONES) {
    for (const by of BED_Y) {
      const x = z.x0 * TILE
      const w = 20 * TILE
      const top = (by + 3) * TILE
      px(x - 4, top + 2 * TILE - 1, w + 8, 9, C.shadow)
      px(x - 4, top - 2, w + 8, TILE + 7, C.woodD) // rim
      px(x - 3, top - 1, w + 6, 2, C.woodL)
      px(x, top + 2, w, TILE + 2, C.soil)
      for (let i = 0; i < 110; i++) px(x + rng() * w, top + 2 + rng() * (TILE + 2), 2, 1, rng() < 0.5 ? C.soilB : C.soilHi)
      px(x - 4, top + TILE + 4, w + 8, TILE - 4, C.wood) // front planks
      for (let k = 0; k <= 20; k++) px(x + k * TILE - 1, top + TILE + 4, 2, TILE - 4, C.woodD)
      for (let k = 0; k < 20; k++) {
        px(x + k * TILE + 3, top + TILE + 7, 2, 2, C.woodDD) // nails
        px(x + k * TILE + 11, top + TILE + 7, 2, 2, C.woodDD)
      }
      px(x - 4, top + TILE + 4, w + 8, 2, C.woodL)
      px(x - 8, top + 2 * TILE + 1, w + 16, 3, C.copper) // drip line
      px(x - 8, top + 2 * TILE + 1, w + 16, 1, C.copperL)
      for (let k = 0; k < 20; k += 2) px(x + k * TILE + 6, top + 2 * TILE + 4, 2, 3, '#7ec4e8')
    }
  }

  // ---- ceiling: a copper mist line, little wooden fans, and warm fairy lights ----
  for (const z of ZONES) {
    px(z.x0 * TILE - 8, 8 * TILE + 2, 20 * TILE + 16, 3, C.copper)
    px(z.x0 * TILE - 8, 8 * TILE + 2, 20 * TILE + 16, 1, C.copperL)
    for (let k = 1; k < 20; k += 3) {
      px(z.x0 * TILE + k * TILE, 8 * TILE + 5, 2, 3, C.copperD)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      for (let m = 0; m < 4; m++) ctx.fillRect(z.x0 * TILE + k * TILE + (rng() - 0.5) * 8, 8 * TILE + 9 + m * 3, 1, 1)
    }
    for (const fx of [z.x0 + 4, z.x0 + 16]) {
      const cx = fx * TILE
      const cy = 6 * TILE + 8
      px(cx - 14, cy - 3, 28, 6, 'rgba(70,45,20,0.14)')
      px(cx - 13, cy - 2, 26, 4, C.woodD)
      px(cx - 2, cy - 13, 4, 26, C.woodD)
      px(cx - 13, cy - 2, 26, 1, C.woodL)
      px(cx - 4, cy - 4, 8, 8, C.copper)
      px(cx - 2, cy - 2, 4, 4, C.copperL)
    }
    // fairy lights: a drooping string with glowing bulbs
    const y0 = 7 * TILE - 4
    const x0 = z.x0 * TILE - 8
    const len = 20 * TILE + 16
    for (let i = 0; i <= len; i += 2) {
      const sag = Math.sin((i / len) * Math.PI * 4) * 3 + 3
      px(x0 + i, y0 + sag, 2, 1, '#8a6a46')
    }
    for (let i = 10; i < len; i += 22) {
      const sag = Math.sin((i / len) * Math.PI * 4) * 3 + 3
      ctx.fillStyle = 'rgba(255, 224, 138, 0.28)'
      ctx.fillRect(x0 + i - 3, y0 + sag + 1, 8, 8)
      px(x0 + i, y0 + sag + 2, 3, 4, C.lamp)
    }
  }

  // ---- rain barrels (top-left), with a copper pipe running to the beds ----
  const t = FEATURES.tanks
  px((t.x + 0.4) * TILE, (t.y + 3.1) * TILE, t.w * TILE, 8, C.shadow)
  for (let i = 0; i < 3; i++) {
    const bx = (t.x + i * 1.7) * TILE + 2
    const by = (t.y + 0.3) * TILE
    px(bx, by + 4, 26, 42, C.wood)
    px(bx + 2, by + 4, 5, 42, C.woodL)
    px(bx + 21, by + 4, 5, 42, C.woodD)
    for (let k = 0; k < 26; k += 5) px(bx + k, by + 6, 1, 38, C.woodD)
    px(bx - 1, by + 12, 28, 3, '#6f5a4a')
    px(bx - 1, by + 34, 28, 3, '#6f5a4a')
    px(bx + 1, by, 24, 8, '#9fd4e6') // water surface
    px(bx + 5, by + 2, 16, 4, '#6cb7dd')
    px(bx + 7, by + 2, 4, 1, '#ffffff')
    px(bx + 11, by - 3, 4, 5, C.copperD)
  }
  px((t.x + t.w) * TILE - 6, (t.y + 2) * TILE, 14 * TILE, 3, C.copper)
  px((t.x + t.w) * TILE - 6, (t.y + 2) * TILE, 14 * TILE, 1, C.copperL)

  // ---- workbench with a laptop, a mug of tea and a tiny plant (top-right) ----
  const d = FEATURES.desk
  px(d.x * TILE, (d.y + 1.2) * TILE, d.w * TILE, 8, C.shadow)
  px(d.x * TILE, d.y * TILE + 6, d.w * TILE, 3 * TILE - 12, C.wood)
  px(d.x * TILE, d.y * TILE + 6, d.w * TILE, 4, C.woodL)
  for (let k = 0; k < d.w * 2; k++) px(d.x * TILE + k * 16, d.y * TILE + 10, 1, 3 * TILE - 16, C.woodD)
  px((d.x + 0.7) * TILE, d.y * TILE + 12, 52, 30, '#3a3430')
  px((d.x + 0.7) * TILE + 3, d.y * TILE + 15, 46, 24, '#cfe9d4')
  for (let l = 0; l < 4; l++) px((d.x + 0.7) * TILE + 7, d.y * TILE + 19 + l * 5, 10 + rng() * 24, 2, C.leaf)
  px((d.x + 0.7) * TILE + 12, d.y * TILE + 42, 28, 4, C.creamDD)
  px((d.x + 4.4) * TILE, (d.y + 1.7) * TILE, 10, 11, C.cream) // mug
  px((d.x + 4.4) * TILE + 10, (d.y + 1.7) * TILE + 3, 3, 5, C.cream)
  px((d.x + 4.4) * TILE + 2, (d.y + 1.7) * TILE + 1, 6, 2, '#a5683a')
  px((d.x + 4.4) * TILE + 3, (d.y + 1.7) * TILE - 5, 1, 4, 'rgba(255,255,255,0.7)') // steam
  px((d.x + 5.5) * TILE, (d.y + 1.4) * TILE, 11, 12, C.terra)
  px((d.x + 5.5) * TILE + 2, (d.y + 1.4) * TILE - 6, 7, 6, C.leaf)
  px((d.x + 5.5) * TILE + 4, (d.y + 1.4) * TILE - 9, 3, 4, '#7cb84d')

  // ---- plant shelf with colorful pots (bottom-left) ----
  const s = FEATURES.shelf
  px(s.x * TILE, (s.y + 3.2) * TILE, s.w * TILE, 6, C.shadow)
  for (let r = 0; r < 2; r++) {
    px(s.x * TILE, (s.y + r * 1.8) * TILE + 20, s.w * TILE, 6, C.wood)
    px(s.x * TILE, (s.y + r * 1.8) * TILE + 20, s.w * TILE, 2, C.woodL)
    const pots = ['#d9764a', '#e8a15a', '#d0617a', '#6cb7dd', '#c9a3e0', '#e9c75a', '#7cb84d']
    for (let k = 0; k < 7; k++) {
      const x = (s.x + 0.4 + k * 1.6) * TILE
      const y = (s.y + r * 1.8) * TILE + 20
      if ((k + r) % 3 === 2) {
        px(x + 2, y - 10, 14, 10, '#6aa9c9') // watering can
        px(x + 14, y - 14, 6, 3, '#6aa9c9')
        px(x + 4, y - 12, 10, 2, '#9fd0e6')
      } else {
        const c = pots[(k * 2 + r) % pots.length]
        px(x, y - 12, 18, 12, c)
        px(x - 1, y - 14, 20, 4, c)
        px(x + 3, y - 19, 12, 6, C.leaf)
        px(x + 7, y - 22, 4, 4, flowers[(k + r) % flowers.length]) // a little bloom
      }
    }
  }
  px(s.x * TILE, s.y * TILE, 3, 3 * TILE + 2, C.woodD)
  px((s.x + s.w) * TILE - 3, s.y * TILE, 3, 3 * TILE + 2, C.woodD)

  // ---- seed and soil sacks on a crate (bottom-right) ----
  const p = FEATURES.pallet
  px(p.x * TILE, (p.y + 3.1) * TILE, p.w * TILE, 6, C.shadow)
  px(p.x * TILE, (p.y + 2.4) * TILE, p.w * TILE, 14, C.woodD)
  for (let k = 0; k < 6; k++) px(p.x * TILE + k * 31, (p.y + 2.4) * TILE, 3, 14, C.woodDD)
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 5; k++) {
      const x = (p.x + 0.3 + k * 2) * TILE
      const y = (p.y + 0.6 + r * 1.0) * TILE
      px(x, y, 28, 26, '#d8b982')
      px(x, y, 28, 4, '#ebd29e')
      px(x + 4, y, 20, 2, '#a98a58')
      px(x + 6, y + 9, 16, 11, '#fbf6e6')
      px(x + 11, y + 11, 6, 6, C.leaf)
      px(x + 13, y + 9, 2, 3, '#7cb84d')
    }
  }

  // ---- front door, welcome mat and flower boxes ----
  const dr = FEATURES.door
  px((dr.x - 0.5) * TILE, 36 * TILE + 2, (dr.w + 1) * TILE, 10, C.woodD)
  px(dr.x * TILE, 37 * TILE, dr.w * TILE, TILE, C.wood)
  px(dr.x * TILE + (dr.w * TILE) / 2 - 1, 37 * TILE, 2, TILE, C.woodDD)
  px(dr.x * TILE + 4, 37 * TILE + 4, (dr.w * TILE) / 2 - 10, TILE - 8, C.woodL)
  px(dr.x * TILE + (dr.w * TILE) / 2 + 6, 37 * TILE + 4, (dr.w * TILE) / 2 - 10, TILE - 8, C.woodL)
  px((dr.x + 1) * TILE, 35 * TILE + 2, (dr.w - 2) * TILE, 12, '#b5483f') // welcome mat
  px((dr.x + 1) * TILE + 2, 35 * TILE + 4, (dr.w - 2) * TILE - 4, 2, '#e6a79a')
  px((dr.x + 1) * TILE + 2, 35 * TILE + 10, (dr.w - 2) * TILE - 4, 2, '#e6a79a')
  for (const bx of [dr.x - 2.4, dr.x + dr.w + 0.6]) {
    px(bx * TILE, 36 * TILE - 2, 26, 14, C.wood)
    px(bx * TILE, 36 * TILE - 2, 26, 3, C.woodL)
    for (let k = 0; k < 4; k++) {
      px(bx * TILE + 2 + k * 6, 36 * TILE - 9, 4, 7, C.leaf)
      px(bx * TILE + 1 + k * 6, 36 * TILE - 12, 5, 4, flowers[k % flowers.length])
    }
  }

  // ---- weather stations: a post with a little box that reads the air (clickable overlays on top) ----
  for (const z of ZONES) {
    const hx = z.hub.x * TILE
    const hy = z.hub.y * TILE
    px(hx + 12, hy + 28, 8, 4 * TILE, C.woodD)
    px(hx + 12, hy + 28, 2, 4 * TILE, C.woodL)
    px(hx + 4, hy + 4 * TILE + 24, 24, 5, C.shadow)
    px(hx, hy + 6, 32, 26, C.creamDD)
    px(hx + 1, hy + 7, 30, 24, C.cream)
    px(hx - 2, hy, 36, 8, C.teal) // little copper-teal roof
    px(hx - 2, hy, 36, 2, '#8ed0bd')
    px(hx + 3, hy + 3, 26, 2, '#4a9484')
    for (let v = 0; v < 3; v++) px(hx + 4, hy + 14 + v * 4, 12, 2, C.creamDD)
    px(hx + 20, hy + 13, 8, 8, '#e3f5da')
    px(hx + 22, hy + 15, 4, 4, C.leaf) // the little leaf lamp
    px(hx + 20, hy + 24, 8, 4, C.copperL)
  }

  // ---- a sleeping cat on the front boardwalk ----
  const cx = 45 * TILE
  const cy = 30 * TILE + 8
  px(cx - 2, cy + 12, 38, 5, C.shadow)
  px(cx, cy, 34, 14, '#e8a05a')
  px(cx + 2, cy - 2, 30, 4, '#e8a05a')
  px(cx + 4, cy + 2, 3, 10, '#c9803a') // stripes
  px(cx + 12, cy + 1, 3, 11, '#c9803a')
  px(cx + 20, cy + 2, 3, 10, '#c9803a')
  px(cx - 4, cy + 2, 12, 11, '#f0b070') // head
  px(cx - 4, cy - 2, 4, 5, '#e8a05a') // ears
  px(cx + 4, cy - 2, 4, 5, '#e8a05a')
  px(cx - 2, cy + 6, 4, 1, '#5e3d20') // closed eyes
  px(cx + 3, cy + 6, 4, 1, '#5e3d20')
  px(cx, cy + 8, 3, 2, '#e8908a') // nose
  px(cx + 30, cy + 8, 10, 4, '#e8a05a') // tail
  px(cx + 38, cy + 4, 4, 6, '#c9803a')

  // ---- the greenhouse frame: cream painted wood with pale blue glass ----
  const wall = (x: number, y: number, w: number, h: number, horizontal: boolean) => {
    px(x, y, w, h, C.creamDD)
    ctx.fillStyle = C.glass
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4)
    ctx.fillStyle = C.glassHi
    if (horizontal) for (let k = 14; k < w; k += 70) ctx.fillRect(x + k, y + 2, 10, h - 4)
    else for (let k = 14; k < h; k += 70) ctx.fillRect(x + 2, y + k, w - 4, 10)
    px(x, y, w, 1, C.cream)
  }
  wall(2 * TILE, 2 * TILE, 68 * TILE, TILE, true)
  wall(2 * TILE, 37 * TILE, 31 * TILE + 8, TILE, true)
  wall(39 * TILE - 8, 37 * TILE, 31 * TILE + 8, TILE, true)
  wall(2 * TILE, 2 * TILE, TILE, 36 * TILE, false)
  wall(69 * TILE, 2 * TILE, TILE, 36 * TILE, false)
  for (let k = 2; k <= 70; k += 6) {
    px(k * TILE - 3, 2 * TILE, 6, TILE, C.cream)
    px(k * TILE - 3, 37 * TILE, 6, TILE, C.cream)
    px(k * TILE - 3, 2 * TILE, 1, TILE, C.creamD)
    px(k * TILE - 3, 37 * TILE, 1, TILE, C.creamD)
  }
  for (let k = 2; k <= 37; k += 5) {
    px(2 * TILE, k * TILE - 3, TILE, 6, C.cream)
    px(69 * TILE, k * TILE - 3, TILE, 6, C.cream)
  }
  for (let k = 8; k < 66; k += 14) {
    px(k * TILE, 2 * TILE + 4, 5 * TILE, 6, C.cream)
    px(k * TILE, 2 * TILE + 4, 5 * TILE, 2, '#ffffff')
    for (let i = 0; i < 5 * TILE; i += 8) px(k * TILE + i, 2 * TILE + 8, 4, 2, C.creamD)
  }
  // corner finials
  for (const [fx, fy] of [[2, 2], [69, 2], [2, 37], [69, 37]]) px(fx * TILE - 1, fy * TILE - 1, TILE + 2, TILE + 2, C.cream)
}
