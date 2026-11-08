# Deem local device demo

Scaled mock of the ESP display + hardware buttons, backed by a **swappable mock
backend**. Replace `src/mock/backend.ts`’s exported `backend` with a Railway /
Mongo / Gemini implementation later — the UI talks only to the `DeemBackend`
interface.

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

**MIC** and **TEST** are physical keyboard keys, not buttons on the screen. Defaults: `M` = MIC (hold to talk, release to send), `T` = TEST. Change them in `src/lib/keys.ts`. Confirm/retry are touch buttons on the screen. There is no typing.

1. Boot → setup prompt: "Hold the MIC key and say your plant."
2. Hold **MIC**, say the plant, release. The screen shows what it heard, then the match to confirm
3. Tap **CONFIRM** → sensor check
4. Health page: the most recent test, with a **LAST TEST** time. A hint ("solution needed? ↓") points at the MIC key
5. **TEST** takes a test input now. The mock walks the fixtures (healthy, dry soil, high CO2, ...)
6. Hold **MIC** on the live screen and ask a question out loud; the answer appears on screen
7. **Swipe** left/right (finger, mouse drag, or arrow keys): health → inputs → history. History is a line chart of the **average health per hour**

## Alert sound

When a reading is **outside the plant's healthy range** (the thresholds in the plant data: soil moisture, temperature, humidity, and soil nutrients / light if a sensor reports them), **or past the blanket air-quality limits** (CO2 above 1500 ppm, PM2.5 above 35, PM10 above 150; the same for every plant, see `src/lib/airQuality.ts`), the device plays an alert sound (five alternating beeps, synthesized with Web Audio) and the health page shows what is wrong, e.g. "Soil too dry".

- **MVP:** nothing corrects itself, so *every* out-of-range reading alerts. It repeats with each new reading while the problem lasts (every 10 minutes, or on TEST).
- **Failure screen:** while any alert is active, the health page is replaced by a wilting, slightly gray version of the plant filling most of the screen, with what is wrong (e.g. "Soil too dry") and **one sentence** on what to do. The sentence is the first sentence of the plant's stored fix for that case (or the shared air-quality fix), so it matches what the assistant says. The same wilted image is used for every kind of failure. The normal health page returns once the reading is back in range. The wilted images are `public/sprites/wilted/<plant_type_id>.png`, made from the healthy sprites by `data/plants/sprites/generate_wilted.py`.
- It never plays while the MIC key is recording (it would be heard as speech); it waits until the mic is idle.
- **Later (full-greenhouse dashboard):** a biosphere controller fixes what it can (watering, temperature, humidity), and the device alerts only for what it cannot change, e.g. soil quality. Switch that on by listing the controller's metrics in `AUTO_CORRECTED` in `src/lib/alerts.ts`, or build with `VITE_AUTO_CORRECTED="soil_moisture,temp_c,rh_pct,co2_ppm"` (a ventilation controller would take over CO2).
- Browsers only allow sound after a key press or touch (the first one unlocks it). A kiosk Chromium can skip that with `--autoplay-policy=no-user-gesture-required`.
- `?silent` in the URL turns the sound off (rehearsing, development). The on-screen alert still shows.

**Seeing every failure (browser mock):** press the TEST key (**T**) repeatedly to step through them in order, then it wraps back to healthy. Add `?silent` to the URL to mute the alert sound.

| TEST press | Screen says | Fixture |
|---|---|---|
| 0 (start) | normal health page | `healthy` |
| 1 | Soil too dry | `dry_soil` |
| 2 | Soil too wet | `overwatered` |
| 3 | Too cold | `cold_snap` |
| 4 | Too hot | `too_hot` |
| 5 | Air too dry | `dry_air` |
| 6 | Air too humid | `humid_air` |
| 7 | Stuffy air (CO2) | `high_co2` |
| 8 | Dusty or smoky air | `dusty_pm25` |
| 9 | Dusty air | `dusty_pm10` |

Fixtures are in `src/mock/fixtures/dracaena/`; each breaks only its own rule. `src/mock/failures.test.tsx` checks all of them.

## Voice (Fish Audio speech-to-text)

Hold MIC → the browser records → `POST /api/transcribe` → `server/` forwards to Fish Audio (`transcribe-1-pro`) → text.
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

- Subscribes to `deem/<id>/telemetry`, `deem/<id>/status` and `deem/<id>/cmd/ack`.
- Every telemetry message updates the screens live. Missing metrics show `--`. Unknown numeric keys still show on the Inputs page. Malformed packets are dropped.
- `ts: 0` is fine (no clock on the ESP32): arrival time is used.
- Setup's sensor check passes when the first telemetry message contains each sensor's metrics (Soil: `soil_moisture`, AQI: `co2_ppm`, Temp/RH: `temp_c` + `rh_pct`). It fails if the device never reports.
- "device offline" shows when the broker drops or the device's Last Will (`status: offline`) arrives.
- The backend can switch the pump with `set_relay { channel: 1 }` (acked, always followed by `off`). There is no Water button on the screen; it is for the automatic watering logic.
- **TEST** (physical key) sends `sample_now` (added to the contract as an additive action) and shows the fresh telemetry the ESP publishes. If the firmware doesn't support it (no ack, or `ok:false`), the screen shows the newest reading and says "no new reading".
- History: one point per hour, the average of that hour's health scores. The last 24 hours are kept in `localStorage`.

Things for the firmware to confirm:

- `soil_moisture`: the UI treats 0-100 as percent and anything higher as raw, converted with `SOIL_RAW_DRY=200` / `SOIL_RAW_WET=2000` in `src/lib/telemetry.ts`. Tune against the real Stemma sensor, or send percent.
- The pump relay is `channel: 1` (`PUMP_CHANNEL` in `src/mock/mqttBackend.ts`).
- Publish retained `status` `{"state":"online"}` after connecting, with `{"state":"offline"}` as the Last Will.

## Swap the knowledge backend later

Plant matching, Q&A and sprites still come from the mock (`MockBackend`). Atlas / Gemini replace that
by implementing `listPlants`, `matchPlant` and `ask` and passing it as `knowledge` in `src/backend.ts`.
Telemetry, status, commands and history are already real in live mode.
