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

All controls are on the screen. There is no button row under the device.

1. Boot → setup prompt
2. Type a plant name, or press **MIC** (bottom-right; stand-in for Fish Audio) to "say" it
3. **CONFIRM** the match → sensor check
4. Health page: the most recent test, with a **LAST TEST** time at the top
5. **TEST** (bottom-right, above MIC) takes a test input now. The mock walks the fixtures (healthy, dry soil, high CO2, ...)
6. **MIC** on the live screen opens the Q&A box (mock agent)
7. **Swipe** left/right (mouse drag, finger swipe, or arrow keys): health → inputs → history. The history page is a line chart of the **average health per hour**

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
- **TEST** sends `sample_now` (added to the contract as an additive action) and shows the fresh telemetry the ESP publishes. If the firmware doesn't support it (no ack, or `ok:false`), the screen shows the newest reading and says "no new reading".
- History: one point per hour, the average of that hour's health scores. The last 24 hours are kept in `localStorage`.

Things for the firmware to confirm:

- `soil_moisture`: the UI treats 0-100 as percent and anything higher as raw, converted with `SOIL_RAW_DRY=200` / `SOIL_RAW_WET=2000` in `src/lib/telemetry.ts`. Tune against the real Stemma sensor, or send percent.
- The pump relay is `channel: 1` (`PUMP_CHANNEL` in `src/mock/mqttBackend.ts`).
- Publish retained `status` `{"state":"online"}` after connecting, with `{"state":"offline"}` as the Last Will.

## Swap the knowledge backend later

Plant matching, Q&A and sprites still come from the mock (`MockBackend`). Atlas / Gemini replace that
by implementing `listPlants`, `matchPlant` and `ask` and passing it as `knowledge` in `src/backend.ts`.
Telemetry, status, commands and history are already real in live mode.
