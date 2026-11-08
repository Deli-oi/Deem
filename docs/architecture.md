# Greenhouse AI: system architecture

An affordable, beginner-friendly plant monitor: a small device for one plant, plus a dashboard that shows how the same idea scales to a greenhouse. The pieces are split across three tiers.

```
  ESP32 (one per pot)        Raspberry Pi 5                       Railway (cloud)
  sensors, publishes   MQTT  Mosquitto + deem-controller    HTTPS  ingest service ──▶ Tiger database
  every 10 minutes  ─────▶   + 2.8" touchscreen kiosk      ─────▶   Deem server (voice, plants, Gemini)
                             (reads MQTT directly)                   greenhouse dashboard
```

## Roles

### ESP32: the sensors (`hackathon2026/`)
One ESP32 per pot (MVP: `esp32-pot-01`). It reads the **DHT11** (temperature and humidity: the source of truth for both), the **SEN63C** (CO2, dust) and the **Stemma soil probe** (moisture, soil temperature), and **only publishes**: telemetry every 600 s (retained, QoS 0) plus a retained status message with a Last Will so the Pi knows when it drops. It receives nothing: no commands, no pump, no `sample_now`. It protects the data: a value from a sensor that stopped answering is dropped after 60 s instead of repeated, warm-up CO2 is not sent, and the soil probe reconnects by itself. Credentials live in the gitignored `secrets.h`.

### Raspberry Pi 5: broker, relay, screen (`pi/`)
- **Mosquitto** carries the messages (port 1883 for the ESP32, 9001 WebSocket for the screen).
- **`deem_controller`** (Python) ingests the telemetry, buffers it durably in SQLite so nothing is lost when the internet drops, and relays batches over HTTPS to the cloud ingest service with a bearer token. Retries use backoff.
- **The touchscreen kiosk** (Chromium, `demo/` in `?kiosk` mode on a 240x320 panel) reads the ESP32 over the WebSocket. It works without internet; only the microphone and Gemini need it.

### Cloud (Railway)
- **ingest** (`ingest/`): `POST /ingest` (Pi, token) writes readings into the Tiger database (retries are safe: duplicates are skipped); `GET /api/devices` and `GET /api/readings` serve them read-only.
- **Deem server** (`demo/server/`): the device UI page, `/api/transcribe` (Fish Audio speech to text, key kept server-side), and the knowledge routes. Plants live in the Tiger database (`plant_types`, seeded from the 12 MiFloraDB documents). `/api/plants/match` has Gemini pick the plant you named from that closed list; `/api/ask` has Gemini answer a question from the plant's care notes, the latest reading and the last 24 hours of history.
- **dashboard** (`dashboard/`): the whole-greenhouse view. 45 simulated plants plus the real pot (tagged LIVE) fed from the ingest service.

## Why MQTT
It decouples the sensors from the Pi, is well supported on the ESP32, and the Last Will gives instant offline detection. The same contract scales to more pots later.

## Data flow
1. The ESP32 samples every 10 minutes and publishes JSON to `deem/<device_id>/telemetry`.
2. The Pi screen shows it immediately (WebSocket subscription) and scores it against the plant's healthy ranges; out-of-range values raise an alert and a sound.
3. `deem-controller` buffers the reading and POSTs batches to the ingest service, which stores them in Tiger.
4. The dashboard and Gemini read from there (history for trends, the latest reading for the LIVE plant).
5. Voice: mic tap, then audio goes to the Deem server, to Fish Audio, back as text. Matching and answers go to Gemini. If the cloud fails, the screen falls back to a local matcher and canned answers.

## Where things live
| Path | Purpose |
|------|---------|
| `hackathon2026/` | ESP32 firmware (+ `host_test/` simulation) |
| `pi/` | Pi: Mosquitto config, controller, kiosk and setup scripts |
| `demo/` | Device UI and the Deem Node server |
| `ingest/` | Cloud readings service |
| `dashboard/` | Greenhouse dashboard |
| `docs/mqtt_contract.md` | **The interface the firmware, Pi and app share.** Change it here first. |

Thresholds and health scoring live in the app (`demo/src/lib`), not the firmware.
