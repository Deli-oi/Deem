# Decisions

A log of key project decisions. Add newest entries at the top.

## Template

### YYYY-MM-DD: Title
- **Decision:**
- **Why:**
- **Alternatives considered:**

---

### 2026-11-07: Pi is the central controller; ESP32<->Pi over MQTT
- **Decision:** Split the system into two tiers: ESP32s handle the physicals
  (sensors + relays), and the Raspberry Pi 5 is the central controller that
  ingests data, buffers it, relays it to a web endpoint, and sends commands
  back. ESP32 <-> Pi communication uses **MQTT** via a Mosquitto broker on the
  Pi. The Pi controller is a Python service (`pi/deem_controller`). The web
  endpoint is not yet defined and is abstracted as a pluggable "sink".
- **Why:** MQTT decouples devices from the controller (add/remove ESP32s freely),
  is lightweight and well-supported on ESP32, and gives offline detection via
  Last Will. Python is fast to build on the Pi with good MQTT/HTTP libraries.
  Abstracting the endpoint unblocks the rest of the system while it's TBD.
- **Alternatives considered:** HTTP push (ESP32 POSTs to the Pi) and HTTP poll
  (Pi polls each ESP32's web server) — both are clunkier for sending commands
  and scale worse to multiple devices. The current firmware's WiFi-AP + onboard
  dashboard model is being retired in favor of ESP32-as-MQTT-client.
- **Interface spec:** `docs/mqtt_contract.md` (source of truth for both sides).

---

### 2026-11-07: Link project folder to GitHub
- **Decision:** Use `main` as the default branch, with `https://github.com/Deli-oi/Deem` as `origin`.
- **Why:** Keep the project versioned and backed up outside Dropbox sync.
- **Alternatives considered:** None.
