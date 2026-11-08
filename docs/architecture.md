# Deem System Architecture

Deem is an affordable, all-in-one plant monitoring + automation platform for
greenhouses. Responsibilities are split across two tiers:

```
  ┌─────────────────────┐        MQTT         ┌──────────────────────┐   HTTPS   ┌─────────────┐
  │   ESP32 (one pot)   │  ───────────────▶   │   Raspberry Pi 5     │  ──────▶  │ Web endpoint│
  │  "the physicals"    │   telemetry         │ "central controller" │  relay    │   (TBD)     │
  │                     │   ◀───────────────  │  + 2.8" TFT kiosk    │  ◀──────  │             │
  │ sensors + relay     │     commands        │ ingest · buffer ·    │  commands │ dashboard / │
  │                     │                     │ UI · voice  │           │ cloud API   │
  └─────────────────────┘                     └──────────────────────┘           └─────────────┘
```

## Roles

### ESP32 (edge / "the physicals")
Owned by the firmware teammate. **MVP uses one ESP32** for the single demo pot
(second DevKit is spare). That board:
- Reads sensors (SEN63C air quality, DHT11 temp/RH, Stemma soil moisture, …).
- Drives actuators via the 5V relay module (pump, …).
- **Does not** drive the product 2.8" screen (Pi owns that). Any OLED in `e2/` is
  leftover from the old AP dashboard and is not the user-facing UI.
- **Publishes** telemetry to the Pi over MQTT and **subscribes** for commands.

> Note: the current `e2/` firmware runs as its own WiFi **access point** with an
> onboard web dashboard. For the central-controller model this flips: the ESP32
> becomes a WiFi **client** that joins the Pi's network and talks MQTT. See
> `docs/esp32_integration.md`.

### Raspberry Pi 5 (central controller + display)
Owned by the Pi teammate. The Pi:
- Runs the **Mosquitto** MQTT broker (the message bus for devices).
- Runs the **`deem_controller`** Python service, which:
  1. Ingests telemetry from the ESP32.
  2. Buffers readings durably (SQLite) so nothing is lost if the network or the
     web endpoint is down.
  3. Relays normalized readings to a web endpoint (pluggable; not yet defined).
  4. Sends commands back down to the device (relay control, config, etc.).
- **Owns the 2.8" SPI TFT touchscreen** and runs the device UI as a Chromium
  kiosk (`demo/` with `?kiosk`). See `docs/display_kiosk.md`.
- Hosts the camera, USB mic/speaker, and higher-level automation / AI pipeline.

### Web endpoint (TBD)
The cloud/remote destination for data and the source of remote commands. Not yet
designed. The controller treats it as a **pluggable sink** (`pi/deem_controller/sink.py`)
so the rest of the system doesn't block on this decision. Swapping it in should
mostly be a `config.yaml` change.

## Why MQTT
- Decouples the edge board from the controller (same contract scales to more pots later; MVP is one ESP32).
- Lightweight, well-supported on ESP32 (e.g. PubSubClient).
- Built-in **Last Will & Testament** gives instant offline detection.
- Topic wildcards let the Pi listen to devices with one subscription.

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
