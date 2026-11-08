# Instructions for AI agents working on the ESP32 firmware (`hackathon2026/`)

Read this before changing anything. It is the current agreed state of the project (2026-11-08).

## Never commit credentials (this repo is PUBLIC)
- WiFi SSID/password, broker user/password, tokens and API keys live **only** in `hackathon2026/src/secrets.h`.
- `secrets.h` is gitignored. Never `git add -f` it. Never paste real values into `config.h`, comments, docs, logs, commit messages or PR text.
- `config.h` holds placeholders only (`WIFIUSER`, `WIFIPASS`). `secrets.example.h` is the template: when you add a new secret setting, add a placeholder there.
- The shared network / broker IP for the Pi (Connor's side) also goes in `secrets.h`, with a placeholder in `secrets.example.h`. Do not hardcode IPs in tracked files.
- If a credential was ever committed, say so to the human. Do not try to fix it by pushing a new commit: history gets rewritten by Eli.

## Git rules
- Never push or merge to `main` directly. Work on a branch and open a PR.
- Never use `git add -A` / `git add .` blindly, and never force-push. Check `git status` first: a previous PR accidentally deleted 273 files that way.
- After the history rewrite, do not merge old branches or old clones into `main` (it would bring the password back). Fetch and `git reset --hard origin/main`, after copying your credentials into `secrets.h`.

## What the firmware must do (MQTT contract v1, see `docs/mqtt_contract.md`)
- One ESP32 per pot, `DEVICE_ID` `esp32-pot-01`.
- Publish JSON to `deem/<device_id>/telemetry` (retained, QoS 0) every **600 s**. Metrics: `co2_ppm, temp_c, rh_pct, pm1_0, pm2_5, pm4_0, pm10_0, soil_moisture (%), soil_temp_c`. Leave a metric out when it was not measured, never send stale or fake values.
- Publish `deem/<device_id>/status` (retained, with a Last Will `offline`), including `sensors: {dht, air, soil}` so the app's setup screen can check each sensor in your init order (DHT11, then SEN63C, then Stemma soil).
- **Temperature and humidity: the DHT11 when its reading is within its spec (0-50 C, 20-90 %RH, both), otherwise the SEN63C's, otherwise leave them out.** Impossible values are never published: CO2 outside 1-10000 ppm, dust outside 0-1000 ug/m3 (6553.5 is the sensor's "no data"), and a DHT11 pair like 57 C / 95 %. The app, the ingest service and Gemini drop impossible values too (`docs/mqtt_contract.md`, "Valid ranges").
- **No commands, no pump, no `sample_now`, no cmd/ack topics.** The ESP only publishes.
- Thresholds live in the app, not the firmware. Send raw readings.
- No camera in the MVP.

## Hardware robustness (already implemented, keep it)
- Air and soil values are only published if refreshed in the last 60 s (`FRESH_MS` in `main.cpp`), so an unplugged sensor goes quiet instead of looking healthy.
- CO2 is only published when 1-10000 ppm (the SEN63C reports 65535 while warming up).
- `SoilSens` retries `begin()` every 30 s after it drops out.
- NTP: `configTime(0, 0, NTP_SERVER, "pool.ntp.org")`.
- Soil calibration: read the printed `soil raw=` values and set `DRY_RAW` / `WET_RAW` in `SoilSens.h`.

## Test before you push
Run the host simulation (no hardware needed): `wsl sh hackathon2026/host_test/run.sh` (or `sh hackathon2026/host_test/run.sh` where g++ exists). It must print `ALL PASSED`. Add a case there when you change sensor logic.

## Network integration with Connor's Pi
- The Pi runs Mosquitto (`pi/deploy/mosquitto.conf`: 1883 for the ESP, 9001 WebSocket for the touchscreen app), the touchscreen kiosk, and the central controller that relays readings onward.
- The ESP32 only needs WiFi credentials and the broker host/IP, both from `secrets.h`. Use a stable address (static IP or mDNS name) for the broker and tell Eli what you chose so the app's `VITE_MQTT_URL` can match.
- Do not add another firmware tree (an `e2/` fork was proposed and rejected): there is one firmware, in `hackathon2026/`.

## Ask the human before
Changing topic names, payload shape, the sample interval, or anything in `docs/mqtt_contract.md`: the app and the Pi both depend on them.
