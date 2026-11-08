# Guide for the agent working on the Tiger database (Tiger Data)

Read this fully before touching anything. You are joining a 22-hour hackathon project, "Deem": a cheap single-plant monitoring device plus a mock whole-greenhouse dashboard. Tiger Data (Postgres + TimescaleDB, cloud) is our database. It replaced MongoDB Atlas, and there is **no camera**.

## 1. Hard rules (this repo is PUBLIC)
- **Never print, log, commit or paste a secret**: the Tiger API key, a connection string, `DEEM_SINK_TOKEN`, any password. No secrets in code, docs, tests, PR text, commit messages, screenshots or error output you show.
- Secrets live in **Railway variables** and local gitignored files only (`.env`, `*.local`). The human owner adds and rotates Railway variables. You read them from the environment, you do not hardcode or echo them.
- Work on a branch and open a PR. Never push or force-push to `main`. Never `git add -A` blindly: check `git status` first.
- Do not change the ingest API, the MQTT contract (`docs/mqtt_contract.md`) or topic names without asking the human.
- Do not create paid resources, new accounts or extra services without asking. We have one Tiger service budget.
- Anything you cannot verify from official Tiger Data docs or by running it, say so. Do not guess API shapes.

## 2. What the human already did
They created a Tiger Data **API key** and stored it in Railway. **That is not the same thing as a database connection string.** A Tiger API/CLI key manages services (create, list, get the connection details). The app needs a Postgres connection URL.

Your first job is to find out which you have:
1. Check which Railway variables exist by **name only** (never values). Look for a connection URL (`TIGER_DATABASE_URL`, `DATABASE_URL`) and for the API key (ask the human for the variable name if it is not obvious).
2. If there is only an API key: use the official Tiger CLI or API (read the current Tiger Data docs first) to see whether a service already exists. If none exists, **ask the human before creating one**, then create the smallest/cheapest tier.
3. Get the service's connection string and tell the human exactly which Railway variable to set it in (`TIGER_DATABASE_URL` on the `ingest` service). They paste the value themselves. You never see or store it in git.
4. Connections need TLS. Use the connection string exactly as Tiger provides it (it includes `sslmode=require`).

## 3. What already exists and depends on the database
`ingest/` is a small Node service (Railway, Root Directory `ingest`). Read `ingest/README.md`, `ingest/server/store.mjs`, `ingest/server/handler.mjs`.
- Pi controller `POST /ingest` (Bearer `DEEM_SINK_TOKEN`) with `{"readings":[{device_id, ts, received_ts, fw, metrics}]}`.
- Table created on boot:
  `readings(device_id text, ts timestamptz, received_at timestamptz, fw text, metrics jsonb, PRIMARY KEY (device_id, ts))`.
- Reads: `GET /api/devices` (latest per device), `GET /api/readings?device_id=&hours=24`, `GET /healthz`.
- The dashboard (`dashboard/`) shows one real pot (plant `A-1-1`, tagged LIVE) from those endpoints.
- Metrics are exactly: `co2_ppm, temp_c, rh_pct, pm1_0, pm2_5, pm4_0, pm10_0, soil_moisture (%), soil_temp_c`. One reading per pot every 10 minutes.

**Known gap:** the ingest tests ran only against an in-memory Postgres (pg-mem), which behaves differently from real Postgres on `ON CONFLICT DO NOTHING ... RETURNING`. Real Postgres returns no row on a skipped duplicate, which is what the code expects. **Verify against the real Tiger service** (see tasks).

## 4. Your tasks, in order
1. **Connect and verify** (section 2). Confirm the ingest service starts against Tiger (`/healthz` ok) and creates `readings`.
2. **Prove the ingest path on the real database:** run `npm test` in `ingest/`, then `python ingest/e2e_pi_sink.py` pointed at a Tiger-backed instance (set `TIGER_DATABASE_URL` in your shell only). Check: a batch stores; the same batch resent stores 0 and reports duplicates; `/api/readings` returns oldest first. Fix real-Postgres differences you find, and add a test for each.
3. **Make `readings` a TimescaleDB hypertable** on `ts` (`create_hypertable`, `if_not_exists`), as an idempotent step in `store.mjs` `init()`. The primary key must include the partition column (it does). If the extension is unavailable, skip with a logged warning rather than crash.
4. **Hourly rollup for the history chart (optional, only if time):** the dashboard and device show average health per hour. A continuous aggregate over `readings` per device per hour is fine, but keep `/api/readings` working unchanged.
5. **Plant knowledge table.** Source of truth: `demo/public/plants/seed_all.json` (12 plant types; fields `plant_type_id, common_names, scientific_name, synonyms, thresholds{temp_c, rh_pct, soil_moisture, light_lux, soil_ec, light_mmol}, care, solutions, common_problems, sprite_ref, embedding_text`). Create `plant_types` (key `plant_type_id`, structured columns or `jsonb` for the rest), plus a loader script `ingest/scripts/load_plants.mjs` that upserts from the seed file idempotently. **Thresholds stay structured and readable**: the app evaluates alerts from them. Add a test that loads all 12 and checks counts and a few threshold values.
6. **Vector search for plant matching and Q&A (only after 1-5 work):** enable `pgvector`, add an `embedding vector(N)` column on `plant_types`, and expose `GET /api/plants/match?q=` that returns the closest plant. The embedding model is **Gemini** (not wired up yet; ask the human before using or adding any API key). Until then, a plain text/trigram fallback match is acceptable. The current device app uses a local fake matcher in `demo/src/lib/matchPlant.ts`; do not change the app, only provide the endpoint.
7. **Report back** in the PR description: what you verified against real Tiger, what you could not, row counts, and any cost-affecting choice you made.

## 5. How to test and what "done" means
- `cd ingest && npm test` passes. `python ingest/e2e_pi_sink.py` prints PASS.
- Against the real Tiger service: duplicate-batch behaviour and `/healthz` verified.
- The seed loader is idempotent (run twice, same row count).
- No secret appears in `git diff`, test output or logs. Run `git diff origin/main` and read it before pushing.
- PR is small and describes the Railway variables the human must set.

## 6. Project facts you may need
- Device: one ESP32 per pot (`esp32-pot-01`) publishes MQTT to a Raspberry Pi 5 (Mosquitto + Python controller + touchscreen kiosk). The controller relays batches over HTTP to `ingest/`. The device screen reads MQTT directly and does not need this database to work.
- Thresholds and health scoring live in the app (`demo/src/lib`), not the firmware.
- No commands, no pump, no `sample_now`. Read-only telemetry.
- Railway: separate services (`demo` device app, `dashboard`, `ingest`), each with its own Root Directory and auto-deploy from `main`.
- Related docs: `docs/mqtt_contract.md`, `docs/dev_workflow.md` (variable names), `decisions.md`, `ingest/README.md`.

## 7. Ask the human before
Creating or resizing any Tiger service, adding any API key or paid dependency, changing a public API shape, dropping or altering the `readings` table once it holds real data, or anything touching the history of `main`.
