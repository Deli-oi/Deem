# Greenhouse AI: device screen

The UI for the 2.8" 240x320 touchscreen (also runs in any browser), plus the Node server that hosts it (`server/`). It has two backends behind one `DeemBackend` interface: a **fixture mock** (no hardware; `?scenario=<id>` shows each failure) and a **live** one that reads the real ESP32 over MQTT. In live mode, plant matching and answers come from the hosted server (Gemini + the Tiger database) with the mock as the offline fallback.

## Run (visual test)

```bash
cd demo
npm install
npm run dev
```

Open **http://127.0.0.1:5173/** (Cursor port-forward / Simple Browser if remote).

```bash
npm test
npm run build
npm start   # serves dist on PORT (default 3000) — Railway style
```

Repo workflow: `docs/dev_workflow.md` (branch → push → PR on `Deli-oi/Deem`, no forks).

## Demo flow

Everything is on the touch screen; there is no typing. The **MIC** is a button at the bottom of the screen: **tap once to turn the mic on, tap again to turn it off and send.** (The production device will use a physical button for this.) Confirm/retry are touch buttons too.

1. Boot → setup prompt: "Tap the mic and say your plant."
2. Tap **MIC**, say the plant, tap it again. The screen shows what it heard, then the match to confirm
3. Tap **CONFIRM** → sensor check
4. Health page: the most recent test, with a **LAST TEST** time. A hint ("solution needed? ↓") points at the MIC button
5. Tap **MIC** on the live screen and ask a question out loud; the answer appears on screen
6. **Swipe** left/right (finger, mouse drag, or arrow keys): health → inputs → history. History is a line chart of the **average health per hour**

## Alert sound

Every alert is **critical** (the labels say so, e.g. "Soil critically dry"): a plant's range is the extremes it tolerates, so you are only notified when a reading is bad enough to harm the plant, never for a small drift. When a reading is **outside the plant's healthy range** (the thresholds in the plant data: soil moisture, temperature, humidity, and soil nutrients / light if a sensor reports them), **or past the blanket air-quality limits** (CO2 above 1500 ppm, PM2.5 above 35, PM10 above 150; the same for every plant, see `src/lib/airQuality.ts`), the device plays an alert sound (five alternating beeps, synthesized with Web Audio) and the health page shows what is wrong, e.g. "Soil critically dry".

- **MVP:** nothing corrects itself, so *every* out-of-range reading alerts. It repeats with each new reading while the problem lasts (every 10 minutes, or on TEST).
- **Failure screen:** while any alert is active, the health page is replaced by a wilting, slightly gray version of the plant filling most of the screen, with what is wrong (e.g. "Soil critically dry") and **one sentence** on what to do. The sentence is the first sentence of the plant's stored fix for that case (or the shared air-quality fix), so it matches what the assistant says. The same wilted image is used for every kind of failure. The normal health page returns once the reading is back in range. The wilted images are `public/sprites/wilted/<plant_type_id>.png`, made from the healthy sprites by `data/plants/sprites/generate_wilted.py`.
- It never plays while the MIC key is recording (it would be heard as speech); it waits until the mic is idle.
- **Later (full-greenhouse dashboard):** a biosphere controller fixes what it can (watering, temperature, humidity), and the device alerts only for what it cannot change, e.g. soil quality. Switch that on by listing the controller's metrics in `AUTO_CORRECTED` in `src/lib/alerts.ts`, or build with `VITE_AUTO_CORRECTED="soil_moisture,temp_c,rh_pct,co2_ppm"` (a ventilation controller would take over CO2).
- Browsers only allow sound after a key press or touch (the first one unlocks it). A kiosk Chromium can skip that with `--autoplay-policy=no-user-gesture-required`.
- `?silent` in the URL turns the sound off (rehearsing, development). The on-screen alert still shows.

**Seeing every failure (browser mock):** open the page with `?scenario=<id>` (`healthy`, `dry_soil`, `overwatered`, `cold_snap`, `too_hot`, `dry_air`, `humid_air`, `high_co2`, `dusty_pm25`, `dusty_pm10`). Add `?silent` to mute the alert sound.

| TEST press | Screen says | Fixture |
|---|---|---|
| 0 (start) | normal health page | `healthy` |
| 1 | Soil critically dry | `dry_soil` |
| 2 | Soil critically wet | `overwatered` |
| 3 | Critically cold | `cold_snap` |
| 4 | Critically hot | `too_hot` |
| 5 | Air critically dry | `dry_air` |
| 6 | Air critically humid | `humid_air` |
| 7 | CO2 critically high | `high_co2` |
| 8 | Fine dust critically high | `dusty_pm25` |
| 9 | Dust critically high | `dusty_pm10` |

Fixtures are in `src/mock/fixtures/dracaena/`; each breaks only its own rule. `src/mock/failures.test.tsx` checks all of them.

## Voice (Fish Audio speech-to-text)

Tap MIC → the browser records (tap again to stop) → `POST /api/transcribe` → `server/` forwards to Fish Audio (`transcribe-1-pro`) → text.
The API key lives only on the server.

```bash
npm run build
FISH_AUDIO_API_KEY=... npm start      # serves dist/ and /api/transcribe on :3000
```

- On Railway, add the variable `FISH_AUDIO_API_KEY` to the service. Without it the screen says "Voice is not set up yet."
- Local dev with real voice: run `npm start` (above, port 3000) next to `npm run dev`; Vite proxies `/api` to it.
- Local dev with no mic or key: `VITE_VOICE=fake npm run dev` cycles canned phrases ("dracaena", "why is it drooping?", ...). Override with `VITE_FAKE_VOICE_TEXT="a|b|c"`.
- Safeguards on `/api/transcribe`: same-origin only, 5 MB cap, 20 requests per minute per IP.

## Kiosk mode (the real 2.8" panel)

Open `/?kiosk` to make the page the screen itself (no bezel, 240x320 fits exactly). The Pi owns this panel; remaining hardware detail (exact module) is in `docs/display_kiosk.md`.

## Data

- Plant knowledge seed: `public/plants/` (copied from repo `data/plants/`)
- Dracaena telemetry fixtures: `src/mock/fixtures/dracaena/`

## Live mode: read a real ESP32

The UI can run against the real MQTT contract (`docs/mqtt_contract.md`, v1) instead of fixtures.

```bash
cp .env.example .env.local     # then uncomment and edit the three lines
npm run dev
```

| Variable | Example | Meaning |
|----------|---------|---------|
| `VITE_BACKEND` | `mqtt` | Use the real device. Omit for the fixture mock. |
| `VITE_MQTT_URL` | `ws://deem-pi.local:9001` | Mosquitto **WebSocket** listener on the Pi (added to `pi/deploy/mosquitto.conf`; restart mosquitto after copying it). |
| `VITE_DEVICE_ID` | `esp32-pot-01` | The pot's `device_id`. One ESP32 per pot. |

What the UI does against the contract:

- Subscribes to `deem/<id>/telemetry` and `deem/<id>/status` only (it sends nothing).
- Every telemetry message updates the screens live. Missing metrics show `--`. Unknown numeric keys still show on the Inputs page. Malformed packets are dropped.
- `ts: 0` is fine (no clock on the ESP32): arrival time is used.
- **Setup's sensor check follows the device's real startup.** The rows are in the firmware's init order: Temp/RH (DHT11), AQI (SEN63C), Soil (Stemma). It first waits for the device to say it is online (its retained `status`), then each row turns to a check as that sensor's readings arrive (Temp/RH: `temp_c` + `rh_pct`, AQI: `co2_ppm`, Soil: `soil_moisture`). If the device reports its sensors' startup results in `status.sensors` (`{"dht":true,"air":false,"soil":true}`), a sensor whose startup failed turns to an X at once. It waits up to a minute for a slow sensor (the air sensor needs a few seconds of warm-up), then fails whatever is still silent. If the device never comes online, setup says so.
- "device offline" shows when the broker drops or the device's Last Will (`status: offline`) arrives.
- **No commands, no pump.** The app only listens (readings and status). There is no sample-now and no watering in the MVP.
- The health page shows how old the latest reading is (e.g. "latest reading · 4 min ago"). The device samples every 10 minutes on its own.
- History: one point per hour, the average of that hour's health scores. The last 24 hours are kept in `localStorage`.

Things for the firmware to confirm:

- `soil_moisture`: the firmware sends a **percent** (0-100), calibrated on the device with `DRY_RAW` / `WET_RAW` in `SoilSens.h`. Those need calibrating against the real pot. (The UI also converts raw values above 100 with `SOIL_RAW_DRY` / `SOIL_RAW_WET` in `src/lib/telemetry.ts`, but the firmware does not send raw.)
- `temp_c` / `rh_pct` come from the DHT11; the firmware is the source of truth.
- Telemetry should be **retained** and sent every 10 minutes, and `status` should carry `sensors`. See `docs/firmware_changes_for_zion.md`.

## Plant knowledge, matching and answers (server)

In live mode `src/backend.ts` passes a `RemoteKnowledge` (`src/lib/remoteKnowledge.ts`) to the MQTT backend. It calls the hosted server (`VITE_API_BASE`, default `https://deem-production.up.railway.app` on the Pi build):

| Route | What |
|-------|------|
| `GET /api/plants` | the 12 plants, from the Tiger database (`plant_types`; the seed file if the database is down) |
| `POST /api/plants/match` | Gemini picks the plant you named from that closed list, or no match |
| `POST /api/ask` | Gemini answers from the plant's care notes and healthy ranges, the latest reading, the blanket air-quality limits and the last 24 h of history (trends) from Tiger |
| `POST /api/transcribe` | Fish Audio speech to text |

All four are limited to our own page plus `ALLOWED_ORIGINS` (the Pi screen), rate limited per IP, and keep every key on the server. If any call fails or is slow, `RemoteKnowledge` falls back to the local matcher and canned answers, so the screen never hangs. Server code: `server/knowledge.mjs`, `server/handler.mjs`. Model: `gemini-flash-latest` (override with `GEMINI_MODEL`). Telemetry, status and history are real in live mode.
