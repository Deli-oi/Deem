# Decisions

A log of key project decisions. Add newest entries at the top.

## Template

### YYYY-MM-DD: Title
- **Decision:**
- **Why:**
- **Alternatives considered:**

---

### 2026-11-07: UI ingests the MQTT v1 metric list
- **Decision:** The device mock accepts `docs/mqtt_contract.md` telemetry. Known keys (`co2_ppm`, `temp_c`, `rh_pct`, `pm1_0`, `pm2_5`, `pm4_0`, `pm10_0`, `soil_moisture`, `soil_temp_c`) render on an Inputs page; missing keys are allowed; extra numeric keys still show. Health rings stay soil / temp / humidity.
- **Why:** Firmware may publish a subset per board, and the contract is the source of truth for what the screen must take in.
- **Alternatives considered:** Hard-requiring every metric on every message (rejected — the contract says include only what the device has).

### 2026-11-07: Device mock is screen + buttons only
- **Decision:** The local demo shows only a 2.8" portrait screen and four hardware stand-in buttons under it. Health uses a retro Activity-rings layout (soil / temp / humidity) with the plant sprite. Setup confirm/retry/match are touch buttons on the screen. Swipe moves between health and history. No surrounding marketing chrome.
- **Why:** Matches the latest hardware-facing request: the ESP TFT is the whole product surface; physical buttons sit below; touch is for swipe plus on-screen confirms.
- **Alternatives considered:** Full-page demo stage with fixture chips and brand lockup (replaced).

### 2026-11-07: Prefer Tiger Data (Postgres) over MongoDB Atlas
- **Decision:** If MongoDB is off the table, use **Tiger Data** (Timescale/Postgres) as the cloud data store. Sensor history → hypertables; plant-type knowledge + embeddings → Postgres + **pgvector** (Tiger documents this path). Gemini still does reasoning; Fish Audio still does voice. Atlas is no longer required for MVP.
- **Why:** One SQL database covers time-series telemetry *and* vector RAG. Better fit for 10‑minute readings + daily averages than document Mongo. Railway can host the app while Tiger hosts the DB (or Postgres on Railway as a thinner fallback).
- **Alternatives considered:** MongoDB Atlas (original plan; may be unavailable). Pure Railway Postgres without Timescale (fine for hackathon scale; lose hypertables niceties).

### 2026-11-07: Local demo UI with mock backend
- **Decision:** Ship a Vite/React scaled device demo in `demo/` with a `DeemBackend` interface and `MockBackend` implementation. UI covers setup → sensor check → swipeable health/history, plus fake hardware buttons. Plant seed JSON lives in `data/plants/` (MiFloraDB-derived) and is loaded by the mock until Atlas/Gemini replace it.
- **Why:** Unblocks product iteration and demo rehearsal before Mongo/Fish/Gemini secrets and ESP firmware are ready. Backend swap is a single export change.
- **Alternatives considered:** Waiting on live APIs before UI (rejected). Pi-rendered UI (rejected earlier — ESP owns display; this demo mocks that display).

### 2026-11-07: Railway project linked
- **Decision:** Use the Railway project already linked to Deem / the software lead’s GitHub as the cloud host for app services.
- **Refs (from dashboard URL):**
  - Project: `594f967f-9a15-4c14-8f30-cc6f69ee465f`
  - Service: `f3619240-43a4-47b3-943b-e7dfed0c991d`
  - Environment: `8bc02acd-2aed-4b6a-b638-74de3d0d7f49`
  - URL: `https://railway.com/project/594f967f-9a15-4c14-8f30-cc6f69ee465f/service/f3619240-43a4-47b3-943b-e7dfed0c991d?environmentId=8bc02acd-2aed-4b6a-b638-74de3d0d7f49`
- **Access:** Agent needs a Railway API/token secret in Cursor (e.g. `RAILWAY_TOKEN`) — the public project link alone is not enough to manage the service from this environment.
- **Why:** Unblocks deploy/wiring once token + Mongo/Gemini/Fish secrets are available.

### 2026-11-07: Ownership split, hosting, camera deferral, sprites, local demo
- **Decision:**
  - **ESP owns** sensors, the 2.8" display, and physical buttons (both ESP32 boards stay in the ESP/firmware lane — no Pi UI).
  - **Pi owns** audio for alarms and voice I/O (USB mic + speaker), plus MQTT central controller, Gemini/Fish clients, and cloud writes.
  - **MongoDB Atlas** is hosted in the cloud over the internet (not on-box).
  - **Railway** hosts our software services (project linked; see entry above).
  - **Camera dropped for first iteration** (storage cost, weak health signal for MVP). Revisit later.
  - **Sprites:** generate one reference sprite for one plant first; after all MVP plant types exist in Mongo, use that sprite as the style reference to produce one per type and attach each to its plant-type document for setup to pull.
  - **Local demo first:** fixture JSON telemetry (dracaena), scaled on-screen display mock, swipeable health + history pages, and fake buttons under the mock that later map to real hardware.
  - **Collect-now:** ESP button triggers an immediate local sample + telemetry publish; a Pi→ESP `sample_now` MQTT action is optional/not required for MVP.
- **Why:** Matches Zion’s hardware ownership; keeps Pi focused on voice/AI/cloud; reduces MVP scope; unblocks software without waiting on the camera or finished TFT firmware.
- **Alternatives considered:** Pi-driven TFT UI (rejected — Zion: ESP owns display/buttons). Camera-on-every-sample (deferred).

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
