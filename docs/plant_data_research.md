# Plant health / care data research (MVP)

Goal: seed MongoDB Atlas with plant-type knowledge so Gemini can match
setup speech, score health against ranges, and suggest fixes. MVP coverage:
**dracaena**, **panda plant** (`Kalanchoe tomentosa`), plus **~10 common
household plants**.

## Recommendation

**Primary source: [Open Plantbook](https://open.plantbook.io/)**  
(`https://open.plantbook.io/api/v1`, docs at `/docs/`, interactive at `/api/docs/`)

| Why it fits Deem | Detail |
|------------------|--------|
| Sensor-shaped thresholds | Returns min/max for soil moisture, temp, humidity, light (lux), soil EC — maps cleanly onto our MQTT `metrics` |
| Care text | Optional `include=care` adds watering / sunlight / soil / pruning / fertilization for Gemini answers |
| Search API | Common + scientific name search → good for voice setup matching |
| IoT heritage | Built for Mi Flora / Home Assistant style monitors; same problem space as ours |
| Free + auth | Client credentials / API token from the Open Plantbook UI |

**Offline / bulk seed fallback: [MiFloraDB](https://github.com/khronimo/MiFloraDB)**  
CSV dump (~5,335 species) of Xiaomi Flower Care ranges (moisture, temp, light, conductivity). Confirmed community use for multiple *Dracaena* spp. License/provenance is a rip of a commercial app — fine for hackathon seed data; prefer Open Plantbook for anything we ship long-term.

**Narrative care supplement (optional): [Perenual Plant API](https://perenual.com/docs/api)**  
Watering benchmarks, sunlight, soil, pest notes, care guides. Stronger prose, weaker numeric sensor thresholds. Use to enrich Atlas documents after thresholds are loaded.

**Not recommended as primary**

| Source | Why skip for MVP |
|--------|------------------|
| Trefle | Huge taxonomic DB; care fields filled for ~1.5% of species |
| Kaggle “Plant-Health-Data” | Synthetic biosensor time series, not per-species care ranges |
| Random houseplant CSVs | Incomplete / inconsistent units; worse than Open Plantbook |

## Proposed MVP plant list (12)

| # | Common name | Scientific (search key) | Role |
|---|-------------|-------------------------|------|
| 1 | Dracaena (corn plant / marginata — confirm which we have) | `Dracaena fragrans` / `Dracaena marginata` | **Live demo** |
| 2 | Panda plant | `Kalanchoe tomentosa` | **Live demo alt** |
| 3 | Golden pothos | `Epipremnum aureum` | Locked earlier |
| 4 | Snake plant | `Dracaena trifasciata` (aka Sansevieria) | Common household |
| 5 | ZZ plant | `Zamioculcas zamiifolia` | Common household |
| 6 | Peace lily | `Spathiphyllum wallisii` | Common household |
| 7 | Spider plant | `Chlorophytum comosum` | Common household |
| 8 | Monstera | `Monstera deliciosa` | Common household |
| 9 | Chinese evergreen | `Aglaonema commutatum` | Common household |
| 10 | Rubber plant | `Ficus elastica` | Common household |
| 11 | Heartleaf philodendron | `Philodendron hederaceum` | Common household |
| 12 | Aloe vera | `Aloe vera` | Common household / contrast succulent |

Confirm exact dracaena species with Zion once the physical plant is ID’d. Open Plantbook / MiFlora often have multiple cultivars — store one canonical PID per type for setup matching.

## Target Atlas document shape (per plant type)

Enough for scoring + RAG; refine when we implement seed scripts.

```json
{
  "plant_type_id": "kalanchoe_tomentosa",
  "common_names": ["panda plant", "panda bear plant"],
  "scientific_name": "Kalanchoe tomentosa",
  "source": { "primary": "openplantbook", "pid": "..." },
  "thresholds": {
    "temp_c": { "min": 18, "max": 27 },
    "rh_pct": { "min": 30, "max": 50 },
    "soil_moisture": { "min": 15, "max": 40 },
    "light_lux": { "min": null, "max": null }
  },
  "care": {
    "watering": "...",
    "sunlight": "...",
    "soil": "...",
    "common_problems": ["overwatering / root rot", "leaf scorch"]
  },
  "solutions": [
    { "problem": "soil_too_wet", "advice": "Allow soil to dry fully; check drainage." }
  ],
  "sprite_ref": null
}
```

Vectorize `care` + `solutions` (+ short species blurb) for Gemini retrieval. Keep `thresholds` as structured fields for the rule-based health score.

## Access plan

1. Create a free Open Plantbook account → API client id/secret (or token).
2. Script: search each of the 12 names → pull detail + `include=care` → normalize into the shape above → upsert into Atlas.
3. If a name misses: fall back to MiFloraDB CSV row, then hand-fill care text from Perenual / extension guides for that one species.
4. Spot-check **dracaena** and **panda plant** first; those unblock the demo fixtures.

## Decision needed from software lead

Prefer **Open Plantbook as canonical seed**, with MiFloraDB as offline backup and Perenual as optional prose enrichment. Record yes/no in `decisions.md` when ready; development can start on connectors without waiting if we mock the 12 docs locally.
