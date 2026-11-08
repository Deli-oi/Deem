// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const plants = JSON.parse(readFileSync(new URL('../public/plants/seed_all.json', import.meta.url), 'utf-8'))

describe('plant sprites', () => {
  it('every plant type has a sprite_ref that points at a real file', () => {
    const missing = plants
      .filter((p) => !p.sprite_ref || !existsSync(new URL(`../public${p.sprite_ref}`, import.meta.url)))
      .map((p) => p.plant_type_id)
    expect(missing).toEqual([])
  })

  it('every plant type also has a wilted sprite for failures', () => {
    const missing = plants.filter((p) => !existsSync(new URL(`../public/sprites/wilted/${p.plant_type_id}.png`, import.meta.url))).map((p) => p.plant_type_id)
    expect(missing).toEqual([])
  })

  it('sprite files are named after their plant_type_id', () => {
    for (const p of plants) expect(p.sprite_ref).toBe(`/sprites/${p.plant_type_id}.png`)
  })
})
