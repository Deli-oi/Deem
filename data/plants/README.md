# Plant-type seed data (MVP 12)

Normalized care + threshold documents collected from MiFloraDB for MongoDB Atlas
seeding. See `docs/plant_data_research.md`.

| File | Use |
|------|-----|
| `*.json` | One document per plant type |
| `catalog.json` | Manifest + source provenance |
| `seed_all.json` | Array of all docs for bulk import |

The local demo loads `seed_all.json` from `demo/public/plants/`.
