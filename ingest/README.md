# Deem ingest service

Receives the Pi controller's batched readings and stores them in the **Tiger database** (Postgres).
The greenhouse dashboard reads them back to show the real pot as the plant tagged **LIVE**.

```
ESP32 --MQTT--> Pi (Mosquitto + controller) --HTTP POST /ingest--> this service --> Tiger database
                                                                         ^
                                       dashboard (browser) --GET /api/...┘
```

## Endpoints

| Route | Auth | What |
|-------|------|------|
| `POST /ingest` | `Authorization: Bearer $DEEM_SINK_TOKEN` | Body `{"readings":[{device_id, ts, received_ts, fw, metrics}]}` (exactly what the Pi's `HttpSink` sends). Up to 500 per request. Safe to retry: a reading already stored (same device and time) is skipped. |
| `POST /api/session/start` | our pages only (`ALLOWED_ORIGINS`) | The screen: setup is finished (plant confirmed, every sensor checked). Body `{device_id, plant_type_id}`. Starts a session and returns `session_id`; the newest reading that arrived before setup finished becomes the first stored row. |
| `POST /api/session/heartbeat` | same | The screen, every minute. Body `{session_id}`. |
| `POST /api/session/stop` | same | The STOP button. Body `{session_id}`. |
| `GET /api/session?device_id=` | public, read-only | Is collection running? |
| `GET /api/devices` | public, read-only | Latest reading of every device. |
| `GET /api/readings?device_id=&hours=24&limit=1000` | public, read-only | History for one device, oldest first (max 14 days, 5000 rows). |
| `GET /healthz` | public | Checks the database answers. |

**Data is only stored during a session.** `POST /ingest` keeps a reading only if a session covered the moment it arrived: one started before it, and either ended after it or still open with a heartbeat within 3 minutes. Everything else is dropped and counted as `no_session` in the reply (still HTTP 200, so the Pi does not retry). So nothing is stored before setup finishes, after STOP, or when the screen has gone away (reboot, page closed). The ESP32 keeps publishing the whole time; only what reaches the database is gated. One pot for now (`ALLOWED_DEVICES`, default `esp32-pot-01`).

Rows can be labelled (`label` column, e.g. `bad_test_data`): they stay in the table but are never served or used by Gemini. `node ingest/scripts/label_test_data.mjs --before <ISO time> [--apply]` does it (dry run by default).

Only the nine contract metrics are stored (`co2_ppm, temp_c, rh_pct, pm1_0, pm2_5, pm4_0, pm10_0, soil_moisture, soil_temp_c`); anything else is dropped. If the ESP clock was not synced (`ts` 0), the Pi's receive time is used.
If `DEEM_SINK_TOKEN` is not set, `/ingest` refuses everything (503), so it is never open by accident.
The table is created on first start (`readings`, primary key `device_id + ts`).

## Railway setup (you)

1. New service from this repo, **Root Directory `ingest`**.
2. Variables: `TIGER_DATABASE_URL` (already in Railway: reference the Tiger database), `DEEM_SINK_TOKEN` (make up a long random string), `ALLOWED_ORIGINS` (the pages that may start/stop collection, e.g. `http://localhost:3000` for the Pi screen), optional `ALLOWED_DEVICES`.
3. On the **Pi**, set the same token and the service's public URL (`DEEM_SINK_URL=https://<ingest-domain>/ingest`, `DEEM_SINK_TOKEN=...`). Never commit either.
4. On the **dashboard** service, set `VITE_INGEST_URL=https://<ingest-domain>` (and optionally `VITE_LIVE_PLANT_ID`, default `A-1-1`, and `VITE_LIVE_DEVICE_ID`, default `esp32-pot-01`), then redeploy: `VITE_*` values are compiled in.

## Tests

- `npm test` in `ingest/`: the HTTP behaviour, including sessions and labelling, on an in-memory store and on the real SQL (run on an in-memory Postgres).
- `python ingest/e2e_pi_sink.py` (repo root): the Pi's real `HttpSink` posting to this service, read back from the API.
- `cd dashboard && npm test`: includes the live-pot overlay (`src/data/live.test.ts`).
