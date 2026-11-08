# Decisions

A log of key project decisions. Add newest entries at the top.

## Template

### YYYY-MM-DD: Title
- **Decision:**
- **Why:**
- **Alternatives considered:**

---

### 2026-11-07: One ESP32; Pi owns the 2.8" screen
- **Decision:** The MVP uses a single ESP32 (sensors + relay for the one pot). The second DevKit is spare / unused. The Raspberry Pi 5 owns the 2.8" SPI TFT touchscreen and runs the kiosk web UI (`?kiosk`); the ESP32 does not drive the product display (its onboard OLED in `e2/` is legacy-only).
- **Why:** One plant needs one edge node. The health/AI UI is a browser app and can only run on the Pi; wiring the TFT there keeps the current demo UI as the real device screen.
- **Open:** Exact TFT/touch module (controller chip, product link); see `docs/display_kiosk.md`.
- **Detail:** `docs/architecture.md`, `docs/display_kiosk.md`, `hardware_info.md`.

---

### 2026-11-07: MIC and TEST are physical keys; Fish Audio voice via a server
- **Decision:** MIC (hold to talk) and TEST are mechanical-keyboard keys, not on the screen. No typing: setup and questions are voice only through Fish Audio speech-to-text. The Fish Audio key lives on a small server (`demo/server`, env `FISH_AUDIO_API_KEY`); the browser only talks to `/api/transcribe`. A `?kiosk` mode fits the real 240x320 panel.
- **Why:** The device has no keyboard or text entry, and the API key must not ship in browser code.
- **Open:** Exact 2.8" TFT/touch module; Pi owns the panel (see entry above and `docs/display_kiosk.md`).

---

### 2026-11-07: Hourly chart and sample_now (the on-screen buttons part was replaced by the entry above)
- **Decision:**
  - All controls move onto the 2.8" screen: confirm/retry, a MIC button (Fish Audio voice) on the right, and a TEST button (take a test input) stacked above it. No hardware button row.
  - The health page shows the most recent test. The swipe-right chart is the average health per hour (was per day).
  - Added an additive `sample_now` command to the MQTT contract so TEST makes the ESP publish a fresh reading. Firmware that doesn't support it falls back to the newest reading.
- **Why:** Everything the user touches belongs on the screen; the hourly average gives a useful chart within a short demo.
- **Alternatives considered:** Keeping hardware buttons (rejected). Daily chart (replaced).
- **Detail:** `Eli_decisions.md`, `docs/mqtt_contract.md`.

---

### 2026-11-07: Product scope and software design (software lead)
- **Decision:**
  - MVP is a single-plant display device with physical buttons (touch only for swiping between screens). The master greenhouse dashboard is the production product and appears only as a mock at the end of the live demo.
  - Voice and AI pipeline: Fish Audio for speech, a Gemini model for reasoning, MongoDB Atlas vector storage for plant knowledge and per-plant data.
  - Setup is voice-driven: user says the plant type, Gemini matches it to the database, user confirms, sensor check runs, then the health page loads. No-match handling is not in the hackathon MVP.
  - The vector store for each plant type also holds that type's retro sprite (top-left of the screen). Sprites are generated after the vector storage is set up.
  - MVP plant types: golden pothos, common house plants, dracaena and panda plant. The live demo uses dracaena or panda plant (TBD).
  - Overall health score is a rule-based placeholder for now. A researched calculation replaces it later.
  - Data is collected every 10 minutes, plus a physical "collect now" button that collects and displays the current data point for the live demo.
  - A camera photo is captured with every data collection. In the live data stored in MongoDB for the plant, each collected entry includes the image as one of its data points.
  - A second screen, swipeable to the right of the main health page, shows a day-by-day plant health graph. It is in the MVP. Touch is used only for swiping between screens. Each daily point is the average of that day's overall health scores, based on the health metric to be researched later.
  - All screens share one retro, simple, user-friendly style for non-technical people.
  - Data endpoints use JSON (Connor is building them). Our job is to collect all sensor input in that format and build everything else on top.
- **Why:** Keep the hackathon scope to one fully working plant, while the mock dashboard shows how it scales. The consumer device is friendly and fun. The collected data is the investor value.
- **Alternatives considered:** Touch input instead of physical buttons (rejected: buttons are more fun). Running computer vision on the camera images (deferred past the MVP).
- **Full detail:** `project description.md`.

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
