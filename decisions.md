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

### 2026-11-08: Align the app with Zion's firmware (no commands, no pump, DHT11, real sensor check)
- **Decision:**
  - **No `sample_now` and no pump** in the MVP. The firmware handles no commands and the app sends none. TEST shows the most recent reading and how old it is.
  - **Sampling every 10 minutes** (the firmware's 30 s was for testing; Zion is changing it).
  - **Temperature and humidity come from the DHT11.** The firmware is the source of truth; the SEN63C's own temp/RH are not published (supersedes "SEN63C preferred" in the contract).
  - **Thresholds are handled by the app**, not the firmware (agreed with Zion). The firmware sends raw readings.
  - **Setup's loading screen follows the firmware's real startup**: Temp/RH (DHT11), AQI (SEN63C), Soil (Stemma), in that order. It waits for the device to be online, then for each sensor's readings, and fails a sensor that never comes up or that reports its startup failed. Up to a minute of patience for the air sensor's warm-up.
  - **Telemetry QoS 0 is fine** (see the contract note). Telemetry should be **retained** so the screen gets the latest reading at once.
- **Why:** With one reading every 10 minutes, the screen cannot wait for the next sample at startup, so the device should keep its latest sample on the broker and report which sensors started.
- **Needs from Zion:** retained telemetry, 600 s interval, and `sensors` in the status message (`docs/firmware_changes_for_zion.md`).
- **Supersedes:** the `sample_now` addition (2026-11-07) and the pump/relay parts of earlier entries.

---

### 2026-11-08: Dashboard goes cozy (Stardew Valley style)
- **Decision:** The greenhouse dashboard was too industrial/brutalist. It now has a light, warm parchment background (less green, more nature), a wooden top bar, paper-style cards with soft shadows, leaf/sun/berry accents, and a redrawn map: wooden planter boxes, stone floor, boardwalks, rain barrels, fairy lights, flowers and bushes outside, a workbench, a plant shelf, seed sacks and a sleeping cat, with two butterflies drifting over it. Layout and behavior are unchanged.
- **Why:** A friendlier, cuter look suits the product and the pitch.
- **Unchanged:** The device itself and the mini display (it stays dark in the pop-up).

---

### 2026-11-08: Every alert is "critical"
- **Decision:** All failure labels say "critically": "Soil critically dry", "Soil critically wet", "Critically cold", "Critically hot", "Air critically dry", "Air critically humid", "CO2 critically high", "Fine dust critically high", "Dust critically high", plus "Soil minerals critically low/high" and "Light critically low/high" for sensors we don't have yet.
- **Why:** You should only be notified when a reading is bad enough to harm the plant. A plant's range comes from the extremes it tolerates (and the air limits are set high on purpose), so out of range already means critical. Nothing alerts for a small drift.
- **Not changed:** The thresholds themselves. They were already the tolerable extremes.

---

### 2026-11-07: Mock full-greenhouse dashboard (scalability demo)
- **Decision:** A standalone web app in `dashboard/`, deployed as its own Railway service (Root Directory `dashboard`), shows how Deem scales to a whole greenhouse. All data is simulated; it is not connected to the hardware or any database. Most of the screen is a top-down pixel-art floor plan of the greenhouse; each plant is clickable and opens the same mini display the MVP uses, plus that plant's soil quality. Scrolling down shows overall greenhouse health, then health by plant type, then every plant.
- **Story it tells:** at scale, larger sensors and a biosphere controller keep climate, air and watering in range automatically, so only what it cannot change (soil minerals) alerts a person. Each plant keeps its own soil probe. This is the `AUTO_CORRECTED` idea from the device alerts, switched on.
- **Reuse:** the mini display, alert rules, plant data and sprites are copied from `demo/` into `dashboard/src/shared` (`npm run sync`) so the folder builds on its own.
- **Why:** The investor pitch needs to show the product scaling from one plant to a greenhouse without building the real thing yet.

---

### 2026-11-07: Wilting failure screen
- **Decision:** While an alert is active, the health page is replaced by a wilting, slightly gray version of the plant filling most of the screen, plus the failure label and one sentence of advice (first sentence of the plant's stored fix, or the shared air-quality fix). One wilted image per plant, used for every failure type. Wilted sprites are generated from the healthy ones (`data/plants/sprites/generate_wilted.py`).
- **Why:** An at-a-glance, emotional cue that something is wrong, and exactly what to do, for non-technical people.
- **Alternatives considered:** A different image per failure type (deferred: "good enough for now").
- **Note:** The stored advice text is the same generic wording for all 12 plants (e.g. aloe and panda plant get "Water thoroughly..."), so the sentence is not yet plant-specific.

---

### 2026-11-07: Alert sound for out-of-range readings
- **Decision:** A reading outside the plant's healthy range (plant-data thresholds) plays an alert sound and shows what is wrong on the health page. MVP: every out-of-range reading alerts (nothing self-corrects). Later: a biosphere controller handles watering/temperature/humidity and the device alerts only for what it cannot change (e.g. soil quality), via the `AUTO_CORRECTED` list in `demo/src/lib/alerts.ts`.
- **Air quality:** blanket limits for every plant, since the plant data has no CO2/dust ranges: CO2 > 1500 ppm, PM2.5 > 35 ug/m3 (EPA 24h), PM10 > 150 ug/m3 (EPA 24h). High on purpose so a busy room (e.g. the hackathon demo) does not alert constantly. PM1.0, PM4.0 and low values never alert. Stored fixes in `demo/src/lib/airQuality.ts`.
- **Why:** Without automation, the person must act on these problems, and a sound gets attention when no one is looking at the screen.
- **Alternatives considered:** Alerting only on large deviations (rejected: the healthy range already defines what needs fixing). Spoken alerts through Fish Audio text-to-speech (a possible next step).

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
