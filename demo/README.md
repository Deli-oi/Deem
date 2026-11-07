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

1. Boot → setup prompt
2. Type a plant name (or press **Voice / Ask** for a mock transcript)
3. **Confirm** the match → sensor check animation
4. Health page with score + metrics
5. **Swipe** left/right on the screen for history
6. **Collect** pulls the current fixture reading
7. Fixture chips under the device cycle dry soil / high CO₂ / etc.
8. **Voice / Ask** on the live screen runs the mock Q&A agent

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
- **Water** publishes `set_relay { channel: 1, state: "on" }`, waits for the ack, then sends `off` after 5 seconds (always, even if the `on` ack never came).
- **Collect** is an ESP button: the ESP publishes a fresh telemetry message itself. There is no Pi to ESP "sample now" command in v1, so the on-screen Collect just shows the newest reading.
- History: one point per day, the average of that day's health scores, kept in `localStorage`.

Things for the firmware to confirm:

- `soil_moisture`: the UI treats 0-100 as percent and anything higher as raw, converted with `SOIL_RAW_DRY=200` / `SOIL_RAW_WET=2000` in `src/lib/telemetry.ts`. Tune against the real Stemma sensor, or send percent.
- The pump relay is `channel: 1` (`PUMP_CHANNEL` in `src/mock/mqttBackend.ts`).
- Publish retained `status` `{"state":"online"}` after connecting, with `{"state":"offline"}` as the Last Will.

## Swap the knowledge backend later

Plant matching, Q&A and sprites still come from the mock (`MockBackend`). Atlas / Gemini replace that
by implementing `listPlants`, `matchPlant` and `ask` and passing it as `knowledge` in `src/backend.ts`.
Telemetry, status, commands and history are already real in live mode.
