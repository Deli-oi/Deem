# Greenhouse AI

An affordable, beginner-friendly way to look after a plant. A small device sits in front of one plant, reads its sensors, and talks to you: it shows a health score, raises an alert (with a sound) when something is critically off, and answers questions by voice. A separate dashboard shows how the same idea scales to a whole greenhouse.

Built at a 22-hour hackathon.

> The project was called **Deem** while we built it. A few technical names still say `deem` on purpose (the MQTT topic prefix `deem/...`, the Python package `deem_controller`, the Railway service names). They are part of the interfaces, so they were not renamed.

## How it works

```
 ESP32 (one per pot)                Raspberry Pi 5                              Railway (cloud)
 DHT11 · SEN63C · soil probe        Mosquitto broker                            ┌──────────────────────┐
 ── MQTT, every 10 min ──────────▶  deem-controller ── HTTPS POST (token) ───▶  │ ingest service       │──▶ Tiger database
                                    2.8" touchscreen kiosk                      │ (readings API)       │     (TimescaleDB)
                                      │  reads MQTT directly (WebSocket)        └──────────┬───────────┘
                                      │  mic ──▶ Fish Audio (speech to text)               │
                                      └─ plant match + answers ──▶ Deem server ── Gemini ──┤
                                                                   (plants in Tiger)       ▼
                                                                                    Greenhouse dashboard
                                                                                    (one LIVE pot + simulated rest)
```

- **The device screen works on its own.** It reads the ESP32 over the Pi's MQTT broker. Only the microphone and Gemini need the internet; if the cloud is down the screen falls back to a local matcher and canned answers.
- **Thresholds live in the app**, not the firmware. The firmware only sends raw readings. It never receives commands (no pump, no relay in the MVP).
- **Plant knowledge** (12 plants from the open-source [MiFloraDB](https://github.com/khronimo/MiFloraDB): healthy ranges, care notes, fixes) is stored in the Tiger database. Gemini picks the plant you named from that closed list and answers questions using the plant's notes, the latest reading and the last 24 hours.

## Repository layout

| Path | What |
|------|------|
| `hackathon2026/` | ESP32 firmware (PlatformIO, C++). `host_test/` runs its logic against fake sensors on a PC. |
| `pi/` | Raspberry Pi: Mosquitto config, the `deem_controller` relay (Python), the touchscreen kiosk. See `pi/README.md`. |
| `demo/` | The device UI (React + TypeScript + Vite, 240x320 touchscreen) and its Node server (voice, plants, Gemini). See `demo/README.md`. |
| `ingest/` | Cloud service that receives the Pi's readings and stores them in the Tiger database. See `ingest/README.md`. |
| `dashboard/` | Whole-greenhouse dashboard: pixel-art map, 45 simulated plants, one LIVE real pot. See `dashboard/README.md`. |
| `data/plants/` | The 12 plant-type documents (MiFloraDB) and the thresholds report. |
| `docs/` | Architecture, the MQTT contract, kiosk notes, workflow. |
| `decisions.md` | The decision log (what we chose and why, newest first). |
| `hardware_info.md` | Bill of materials. |

## Quick start (no hardware needed)

```bash
cd demo && npm install && npm run dev      # device UI with fake sensors: http://127.0.0.1:5173
# see every failure screen:  ?scenario=dry_soil   (also too_hot, high_co2, dusty_pm25, ...)
npm test                                   # UI + server tests
```

Other parts:
```bash
cd dashboard && npm install && npm run dev                 # greenhouse dashboard
cd ingest && npm install && npm test                       # cloud ingest service
cd pi && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest
wsl sh hackathon2026/host_test/run.sh                      # firmware logic on a PC (needs g++)
python ingest/e2e_pi_sink.py                               # the Pi's real relay -> ingest -> API
```

## Deploying

Each cloud piece is its own Railway service (set the **Root Directory**):

| Service | Root dir | What |
|---------|----------|------|
| Deem | `demo` | Device UI page + `/api/transcribe`, `/api/plants`, `/api/plants/match`, `/api/ask` |
| ingest | `ingest` | `POST /ingest` (Pi relay), `GET /api/devices`, `GET /api/readings` |
| dashboard | `dashboard` | The greenhouse dashboard (`VITE_INGEST_URL` points it at ingest) |

Variables (names only; the values live in Railway and are never committed):

| Variable | Used by |
|----------|---------|
| `FISH_AUDIO_API_KEY` | Deem server (speech to text) |
| `GEMINI_API_KEY` (optional `GEMINI_MODEL`) | Deem server (matching, answers) |
| `TIGER_DATABASE_URL` | Deem server and ingest (a `postgres://` connection string) |
| `DEEM_SINK_TOKEN` | ingest (and the Pi's `pi/.env`) |
| `ALLOWED_ORIGINS` | Deem server (e.g. `http://localhost:3000` for the Pi screen) |
| `VITE_INGEST_URL` | dashboard build |

**The Pi:** `git fetch && git reset --hard origin/main`, then `bash pi/deploy/setup-sink.sh` (token, relay) and `bash pi/deploy/build-ui.sh` (rebuild the screen), then restart the kiosk. Details in `pi/README.md`.
**The ESP32:** put WiFi and the Pi's broker address in `hackathon2026/src/secrets.h` (copy `secrets.example.h`).

## Rules for working in this repo (it is public)

- **Never commit a secret**: WiFi, tokens, API keys, connection strings. They go in gitignored files (`pi/.env`, `hackathon2026/src/secrets.h`) or Railway variables.
- Work on a branch and open a PR; don't push to `main`, don't force-push.
- Coding agents: read `.github/copilot-instructions.md`.
- The MQTT contract (`docs/mqtt_contract.md`) is shared by the firmware, the Pi and the app. Change it there first.

## Built with

ESP32 · Raspberry Pi 5 · SEN63C · DHT11 · STEMMA soil probe · MQTT / Mosquitto · C++ / PlatformIO · Python · TypeScript / React / Vite · Node.js · PostgreSQL / TimescaleDB (Tiger Data) · Gemini · Fish Audio · Railway · MiFloraDB

## More

`docs/architecture.md` (system overview) · `docs/mqtt_contract.md` (message formats) · `docs/display_kiosk.md` (the 2.8" screen) · `docs/dev_workflow.md` · `docs/tigerdata_agent_guide.md` · `project description.md` (the full product story) · `decisions.md`
