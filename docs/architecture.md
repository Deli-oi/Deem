# Deem System Architecture

Deem is an affordable, all-in-one plant monitoring + automation platform for
greenhouses. Responsibilities are split across two tiers:

```
  ┌─────────────────────┐        MQTT         ┌──────────────────────┐   HTTPS   ┌─────────────┐
  │   ESP32 device(s)   │  ───────────────▶   │   Raspberry Pi 5     │  ──────▶  │ Web endpoint│
  │  "the physicals"    │   telemetry         │ "central controller" │  relay    │   (TBD)     │
  │                     │   ◀───────────────  │                      │  ◀──────  │             │
  │ sensors + relays    │     commands        │ ingest · buffer ·    │  commands │ dashboard / │
  │                     │                     │ relay · API calls    │           │ cloud API   │
  └─────────────────────┘                     └──────────────────────┘           └─────────────┘
```

## Roles

### ESP32 (edge / "the physicals")
Owned by the firmware teammate (Zion). **Both ESP32 boards** live in this lane.
Each ESP32 (as applicable):
- Reads sensors (SEN63C air quality, DHT11 temp/RH, Stemma soil moisture, …).
- Drives actuators via the 5V relay module (pump, etc.).
- Drives the **2.8" TFT display** (health + history UI) and handles **physical
  buttons** + swipe touch.
- **Publishes** telemetry to the Pi over MQTT and **subscribes** for commands
  (e.g. `set_relay`). Collect-now is local: button → sample → publish telemetry.

> Note: the current `e2/` firmware runs as its own WiFi **access point** with an
> onboard web dashboard. For the central-controller model this flips: the ESP32
> becomes a WiFi **client** that joins the Pi's network and talks MQTT. See
> `docs/esp32_integration.md`.

### Raspberry Pi 5 (central controller + voice)
- Runs the **Mosquitto** MQTT broker and **`deem_controller`** (ingest → SQLite
  buffer → relay to cloud).
- Owns **microphone + speaker**: Fish Audio STT/TTS, spoken alarms, Gemini Q&A.
- Does **not** own the plant display or buttons (those stay on the ESP).
- Camera is deferred past the first iteration.

### Cloud
- **MongoDB Atlas** over the internet: plant-type knowledge (vectors + thresholds
  + sprites) and per-plant live data.
- **Railway** hosts software services / APIs (account setup pending).
- The controller’s HTTP sink remains pluggable
  (`pi/deem_controller/sink.py`) so wiring Atlas/Railway is a config + adapter
  change.

## Why MQTT
- Decouples devices from the controller — add/remove ESP32s without code changes.
- Lightweight, well-supported on ESP32 (e.g. PubSubClient).
- Built-in **Last Will & Testament** gives instant offline detection.
- Topic wildcards let the Pi listen to all devices with one subscription.

## Data flow (happy path)
1. ESP32 samples sensors every N seconds.
2. ESP32 publishes JSON to `deem/<device_id>/telemetry` (QoS 1).
3. Pi's controller validates + normalizes it and writes it to the buffer.
4. The relay worker drains the buffer in batches and POSTs to the web endpoint.
5. On success, rows are deleted; on failure, they're retried with backoff and
   eventually dead-lettered.

## Where things live
| Path | Purpose |
|------|---------|
| `e2/` | ESP32 firmware (PlatformIO) — teammate |
| `pi/` | Pi central controller (Python) |
| `pi/deem_controller/` | the service package |
| `pi/deploy/` | Mosquitto + systemd deployment files |
| `docs/mqtt_contract.md` | **the interface both sides code against** |
| `docs/esp32_integration.md` | firmware-side how-to + example code |

The single most important shared artifact is **`docs/mqtt_contract.md`**. If the
topic names or JSON shapes change, change them there first and keep both sides in
sync.
