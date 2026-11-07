# Deem MQTT Contract (v1)

This is the **interface spec** shared by the ESP32 firmware and the Pi
controller. Treat it as the source of truth. If something changes here, update
both sides.

- **Broker:** Mosquitto on the Pi, default port `1883` (plain TCP on the LAN).
- **Base topic prefix:** `deem`
- **Payload encoding:** UTF-8 JSON objects.
- **Protocol:** MQTT 3.1.1 is fine (ESP32 PubSubClient speaks it).

## Device IDs
Each ESP32 has a unique, stable `device_id` string. Lowercase, no spaces/slashes.
Recommended scheme: `esp32-<role>-<nn>`.

| Example | Role |
|---------|------|
| `esp32-aqi-01`  | SEN63C air-quality + OLED node |
| `esp32-soil-02` | soil moisture + relay node |

## Topics

| Topic | Direction | QoS | Retain | Purpose |
|-------|-----------|-----|--------|---------|
| `deem/<device_id>/telemetry` | ESP32 → Pi | 1 | no  | periodic sensor readings |
| `deem/<device_id>/status`    | ESP32 → Pi | 1 | yes | online/offline (LWT) |
| `deem/<device_id>/cmd`       | Pi → ESP32 | 1 | no  | command to the device |
| `deem/<device_id>/cmd/ack`   | ESP32 → Pi | 1 | no  | command acknowledgement |

> The Pi subscribes with wildcards: `deem/+/telemetry` and `deem/+/status`.
> Each ESP32 subscribes to its own `deem/<device_id>/cmd`.

## Payloads

### 1. Telemetry  (`deem/<device_id>/telemetry`)
```json
{
  "device_id": "esp32-aqi-01",
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

### 2. Status / Last Will  (`deem/<device_id>/status`, retained)
Set this as the MQTT **Last Will** when connecting so the broker publishes
`offline` automatically if the device drops. Publish `online` yourself right
after connecting.
```json
{ "state": "online", "fw": "0.1.0" }
```
`state` is `"online"` or `"offline"`.

### 3. Command  (`deem/<device_id>/cmd`)
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
| `identify` | `{}` | Blink LED / show on display to find the device. |
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
