// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../public/', import.meta.url)
const plants = JSON.parse(readFileSync(new URL('../src/shared/plants/seed_all.json', import.meta.url), 'utf-8'))

describe('sprites for every plant type', () => {
  it.each(plants.map((p) => p.plant_type_id))('%s has a map sprite, a device sprite and a wilted sprite', (id) => {
    expect(existsSync(new URL(`map/${id}.png`, root)), `map/${id}.png`).toBe(true)
    expect(existsSync(new URL(`sprites/${id}.png`, root)), `sprites/${id}.png`).toBe(true)
    expect(existsSync(new URL(`sprites/wilted/${id}.png`, root)), `sprites/wilted/${id}.png`).toBe(true)
  })

  it('has all 12 plant types', () => {
    expect(plants).toHaveLength(12)
  })
})
