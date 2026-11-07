import type { PlantMatch, PlantType } from './types'

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Local stand-in for Gemini vector match. Swap for Atlas/Gemini later. */
export function matchPlantLocal(utterance: string, plants: PlantType[]): PlantMatch | null {
  const q = normalize(utterance)
  if (!q || plants.length === 0) return null

  let best: PlantMatch | null = null

  for (const plant of plants) {
    const names = [
      plant.plant_type_id.replace(/_/g, ' '),
      plant.scientific_name,
      ...(plant.common_names ?? []),
      ...(plant.synonyms ?? []),
    ].map(normalize)

    let confidence = 0
    for (const name of names) {
      if (!name) continue
      if (q === name) confidence = Math.max(confidence, 0.98)
      else if (name.includes(q) || q.includes(name)) confidence = Math.max(confidence, 0.86)
      else {
        const qTokens = new Set(q.split(' '))
        const nTokens = name.split(' ')
        const hit = nTokens.filter((t) => qTokens.has(t)).length
        if (hit > 0) confidence = Math.max(confidence, 0.55 + hit * 0.12)
      }
    }

    // soft aliases for demo speech
    if (q.includes('corn plant') && plant.plant_type_id === 'dracaena') confidence = Math.max(confidence, 0.9)
    if (q.includes('panda') && plant.plant_type_id === 'panda_plant') confidence = Math.max(confidence, 0.92)

    if (confidence > 0 && (!best || confidence > best.confidence)) {
      best = { plant, confidence, utterance }
    }
  }

  return best && best.confidence >= 0.55 ? best : null
}
