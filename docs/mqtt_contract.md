# Deem MQTT Contract (v1)

This is the **interface spec** shared by the ESP32 firmware and the Pi
controller. Treat it as the source of truth. If something changes here, update
both sides.

- **Broker:** Mosquitto on the Pi, default port `1883` (plain TCP on the LAN).
- **Base topic prefix:** `deem`
- **Payload encoding:** UTF-8 JSON objects.
- **Protocol:** MQTT 3.1.1 is fine (ESP32 PubSubClient speaks it).

## Device IDs
**One ESP32 per pot.** Each pot is monitored and actuated by a single ESP32,
and that one board reports **all** of the pot's sensor readings in a single
telemetry message. There is no per-sensor or per-role split — the `device_id`
*is* the pot.

Each ESP32 has a unique, stable `device_id` string. Lowercase, no spaces/slashes.
Recommended scheme: `esp32-pot-<nn>` (zero-padded pot number).

| Example | Pot |
|---------|-----|
| `esp32-pot-01` | Pot 1 — all sensors + relay for that pot |
| `esp32-pot-02` | Pot 2 — all sensors + relay for that pot |
| `esp32-pot-03` | Pot 3 — all sensors + relay for that pot |

> **Rule:** every sensor physically attached to a pot is wired to that pot's
> ESP32, and every reading for the pot arrives in one `metrics` object under the
> pot's `device_id`. The Pi keys all data (and the web endpoint's history) by
> `device_id`, so a pot's full sensor picture is a single row per sample.

## Topics

| Topic | Direction | QoS | Retain | Purpose |
|-------|-----------|-----|--------|---------|
| `deem/<device_id>/telemetry` | ESP32 → Pi | 0 | **yes** (latest sample) | sensor readings, one every 10 minutes |
| `deem/<device_id>/status`    | ESP32 → Pi | 1 | yes | online/offline (LWT) + which sensors started |
| `deem/<device_id>/cmd`       | Pi → ESP32 | 1 | no  | *not used in the MVP* |
| `deem/<device_id>/cmd/ack`   | ESP32 → Pi | 1 | no  | *not used in the MVP* |

> The Pi subscribes with wildcards: `deem/+/telemetry` and `deem/+/status`.
>
> **Telemetry is retained** so that anything that connects later (the screen app, a rebooted Pi)
> gets the latest sample immediately instead of waiting up to 10 minutes for the next one.
>
> **Telemetry QoS is 0.** The firmware's PubSubClient library can only publish at QoS 0. That is
> fine on a LAN: the firmware already queues samples and retries while WiFi or the broker is
> down, so a reading is only lost if the connection fails in the instant it is sent.
>
> **Sampling** is every 10 minutes (`SAMPLE_INTERVAL_S` 600). **Thresholds are not on the device**:
> the firmware reports raw readings only, and the app decides what is out of range.

## Payloads

### 1. Telemetry  (`deem/<device_id>/telemetry`)
One message per pot, containing **every** sensor reading the pot's ESP32 took on
that cycle. Include only the metrics the board actually has wired, but all of a
pot's sensors go in this single object:
```json
{
  "device_id": "esp32-pot-01",
  "ts": 1730000000,
  "fw": "0.1.0",
  "metrics": {
    "co2_ppm": 812,
    "temp_c": 22.4,
    "rh_pct": 48.1,
    "pm1_0": 3.2,
    "pm2_5": 5.1,
    "pm4_0": 6.0,
    "pm10_0": 6.4,
    "soil_moisture": 734,
    "soil_temp_c": 21.8
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `device_id` | string | recommended | If omitted, the Pi derives it from the topic. |
| `ts` | number | optional | Device epoch seconds. Send `0` if the device has no clock; the Pi always stamps its own `received_ts`. |
| `fw` | string | optional | Firmware version, for debugging. |
| `metrics` | object | **required** | Flat map of metric → number. Include only what the device actually has. |

**Metric naming convention:** `snake_case`, unit-suffixed where helpful. Keys are
open-ended — the Pi forwards whatever it receives — but stick to this list so the
web endpoint stays consistent:

| Key | Unit | Sensor |
|-----|------|--------|
| `co2_ppm` | ppm | SEN63C |
| `temp_c` | °C | SEN63C / DHT11 |
| `rh_pct` | % RH | SEN63C / DHT11 |
| `pm1_0`, `pm2_5`, `pm4_0`, `pm10_0` | µg/m³ | SEN63C |
| `soil_moisture` | raw (0–1023) or % | Stemma soil sensor |
| `soil_temp_c` | °C | Stemma soil sensor |

## Sensor Inventory (per pot)
The complete list of sensors wired to **each pot's ESP32**. All of these feed the
same per-pot telemetry message above. (Hardware source of truth: `hardware_info.md`.)

| # | Sensor | Interface | Metrics it produces | Units |
|---|--------|-----------|---------------------|-------|
| 1 | **DHT11** (temp / humidity) | 1-wire digital (pin 4) | `temp_c`, `rh_pct` | °C, % RH |
| 2 | **Sensirion SEN63C** (air quality) | I²C (0x6B) | `co2_ppm`, `pm1_0`, `pm2_5`, `pm4_0`, `pm10_0` | ppm, µg/m³ |
| 3 | **Adafruit Stemma I²C Soil Sensor** | I²C (0x36) | `soil_moisture`, `soil_temp_c` | % (calibrated on the device), °C |

The table is in the firmware's startup order (DHT11, then SEN63C, then soil), which is also the order the screen's setup check shows them.

Notes:
- **`temp_c` / `rh_pct` come from the DHT11.** The SEN63C also measures them, but the firmware
  does not publish those values: the firmware is the ground truth (decision 2026-11-08).
- `soil_moisture` is a **percent** (0–100), converted on the device from the probe's raw reading
  (`DRY_RAW` / `WET_RAW` in `SoilSens.h`, which must be calibrated against the real pot).
- The **5V relay module** and a **water pump** are **not used in the MVP**: no relay is driven and
  there is no automatic watering.
- Pi-side devices (USB mic/speaker, **2.8" SPI TFT
  touchscreen**) are **not** pot sensors and do not publish to this contract; they
  live on the Pi. The Pi **owns** the product display (Chromium kiosk); the ESP32
  does not drive it.

### 2. Status / Last Will  (`deem/<device_id>/status`, retained)
Set this as the MQTT **Last Will** when connecting so the broker publishes
`offline` automatically if the device drops. Publish `online` yourself right
after connecting.
```json
{ "state": "online", "fw": "0.1.0", "sensors": { "dht": true, "air": true, "soil": true } }
```
`state` is `"online"` or `"offline"`.

`sensors` is **optional** and says whether each sensor's startup (`begin()`) succeeded:
`dht` (DHT11), `air` (SEN63C), `soil` (Stemma). The screen's setup check uses it to show a failed
sensor right away instead of waiting. Without it, the screen waits for that sensor's readings to
show up in telemetry and gives up after a minute. Publish it (retained, with `online`) after the
sensors have been started, and again if a sensor drops out.

### 3. Command  (`deem/<device_id>/cmd`)
> **Not used in the MVP.** There is no sample-now, no pump, and the firmware handles no commands
> (it answers every one with `ok: false`). The screen sends none. This section is kept for later.

```json
{
  "cmd_id": "9f1c...",
  "ts": 1730000005,
  "action": "set_relay",
  "params": { "channel": 1, "state": "on" }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `cmd_id` | string | Unique id; echo it back in the ack. |
| `ts` | number | Epoch seconds the command was issued. |
| `action` | string | See action table below. |
| `params` | object | Action-specific arguments. |

Initial action vocabulary (extend as needed, keep this table updated):

| action | params | Meaning |
|--------|--------|---------|
| `set_relay` | `{ "channel": <int>, "state": "on"\|"off" }` | Switch a relay channel. |
| `set_interval` | `{ "seconds": <int> }` | Change telemetry publish interval. |
| `identify` | `{}` | Blink an LED (or similar) on the ESP32 to find the board. Product UI lives on the Pi. |
| `reboot` | `{}` | Soft-reboot the ESP32. |

### 4. Command ack  (`deem/<device_id>/cmd/ack`)
```json
{ "cmd_id": "9f1c...", "ok": true, "detail": "relay 1 on" }
```
`ok` is boolean; `detail` is a short human-readable string (optional).

## Versioning
This is **v1**. Breaking changes should bump the version in this file's title and
be called out in `decisions.md`. Additive changes (new metrics, new actions) do
not require a version bump — just update the tables above.

## Valid ranges (impossible values are dropped)

A sensor that is warming up, unplugged or mis-wired can send numbers that are valid JSON but impossible. Every consumer drops them: the screen shows `--` and never scores or alerts on them, the ingest service never stores them (and cleans old rows when serving), and Gemini never reasons about them. The firmware should not send them either.

| Metric | Valid range | Typical bad value |
|--------|-------------|-------------------|
| `co2_ppm` | 1 to 10000 | 0 (not ready), 32767, 65535 |
| `pm1_0`, `pm2_5`, `pm4_0`, `pm10_0` | 0 to 1000 | 6553.5 ("no data") |
| `temp_c` | -10 to 50 (DHT11 measures 0 to 50) | 57 from a mis-wired DHT11 |
| `rh_pct` | 0 to 100 | 95 stuck beside a bad temperature |
| `soil_moisture` | 0 to 100 | |
| `soil_temp_c` | -10 to 60 | |

`temp_c` and `rh_pct` come from one sensor read: if either is out of range, both are dropped. Code: `demo/src/lib/sanity.ts` (the app), copies in `demo/server/sanity.mjs` and `ingest/server/sanity.mjs`.
