# Greenhouse AI (Deem)

An affordable, automatic, beginner-friendly way to monitor a plant. A small device sits in front of one plant, collects sensor data, and talks to the user. It automates what can be automated and tells the user about what can't be.

Built at a 22-hour hackathon. Inspired by Zion's greenhouse experience.

## Goal

Build a consumer product that works at small scale and can later scale up. It should be easy enough for non-technical people to use widely. That wide user base then produces a data set that doesn't exist today, which is the investor pitch.

The model is similar to Pokemon Go. The consumer product is fun and friendly, but the data is what makes the business worth it.

## Who it's for

- **Consumers:** A cheap way to monitor a single plant at a time. It is backed by sensor data and made for beginners.
- **Investors:** Large stores of greenhouse and home-garden plant growth data, in a field that lacks these data points:
  - timelapse pictures linked to decision changes
  - sensor data over time
  - calculated plant health over time

## Product vs. MVP

| | Production product | Hackathon MVP |
|---|--------------------|---------------|
| What | A master dashboard with a full, real-world model of the greenhouse, linked to many individual monitors | One Apple Health-style display device that stays in front of one plant |
| Scope | Many plants and monitors | One plant |
| Role | Shows scalability | Shows the full sensor, AI, voice and data system working |

## MVP: the single-plant monitor

### Capabilities

| Capability | Notes |
|------------|-------|
| Soil moisture monitoring | Stemma I2C Soil Sensor |
| Automatic watering | Water pump driven through a 5V relay module |
| Air quality (AQI) | Sensirion SEN63C (CO2, PM1.0 / 2.5 / 4.0 / 10, temperature, humidity) |
| Temperature / humidity | DHT11 |
| Camera | Raspberry Pi Camera 3. A photo is captured with every data collection (the 10-minute reading and the "collect now" button). Each data entry stored in MongoDB for the plant includes the image as one of its data points. No computer vision in the MVP. |
| Data collection | One data point every 10 minutes, plus a physical **TEST** key that takes a test input immediately and shows it on the health page (used in the live demo) |
| Speaker and microphone | Voice alerts and voice input (USB speaker, USB mic) |

### Display

The display is a 2.8" SPI serial TFT touch screen, slightly larger than an Apple Watch screen. Confirm/retry are touch buttons on the screen, and the touch layer is also used for swiping between screens. **MIC** (hold to talk, Fish Audio speech-to-text) and **TEST** (take a test input) are physical mechanical-keyboard keys, never drawn on the screen. There is no typing: setup and questions are voice only.

- **Style:** Glanceable, rounded and clean, in the spirit of Apple Health / Apple Watch, with a retro videogame look. Every screen uses the same style. It must be simple and user friendly, showing data easily to non-technical people.
- **Screens:** The main health page, plus a history page to its right (below). The user swipes between them.
- **Overall health:** One headline plant health score.
- **Direct readings:** Every sensor measure shown in a nice, readable way.
- **Alerts:** Spoken through the speaker and shown on screen.
- **Retro mascot:** A small retro videogame-style sprite of the plant in the top-left corner. It is chosen automatically from the plant type picked at setup.

### Voice and AI pipeline

```
User speaks -> Fish Audio -> Gemini agent -> MongoDB Atlas (vector search + this plant's data)
                                 |
User hears / sees <- Fish Audio <+  data-backed answer
```

1. The user makes an observation about the plant by voice, through the mic.
2. Fish Audio handles speech in and out.
3. A Gemini model reasons over the question. It uses the most recent sensor data for this plant plus plant-type knowledge pulled from MongoDB Atlas.
4. It replies with a data-backed solution, for example lack of sunlight, water or minerals, or something else. It also raises alerts about problems on its own.

### Plant-type knowledge base (MongoDB Atlas)

We need to collect existing data on plants commonly grown in greenhouses or by home gardeners.

- **One vector store holds everything per plant type:**
  - care and growth data for that type
  - the retro videogame-style sprite for that type. We generate one sprite for every plant type we collect data on, and link it directly to that type's vector storage. After setup the device uses it automatically.
- **Build order:** First set up the MongoDB vector storage with all the MVP plant types (below). Then generate the sprites and link each to its plant type.
- **Per-plant data:** The same Atlas setup holds the live data from each monitored plant. That includes sensor history and the images linked to it.
- **Retrieval:** The Gemini agent pulls from the vector store for the plant it is monitoring, so answers are backed by that plant's own recent data.

### MVP plant types

The vector storage covers these plants for the MVP:

- Golden pothos
- Common house plants
- **Dracaena:** one of the two plants we actually have for live demos
- **Panda plant:** the other live-demo plant

We will decide later which of the two (dracaena or panda plant) to use in the live demo.

### Setup flow

Setup is all voice-driven and uses the physical voice input button on the device.

1. **Prompt:** The screen asks the user to say the plant type.
2. **Speak:** The user presses the voice input button (attached to the screen) and says the plant type.
3. **Transcribe:** Fish Audio transcribes the plant name.
4. **Match:** Gemini matches it to the closest plant in our existing database.
5. **Confirm:** The device asks the user to confirm the matched plant.
6. **Sensor check:** A loading-style screen shows each sensor coming online with a check, check, check, then "done".
7. **Configure:** The system connects the Gemini agent to the correct vector store for that plant type. It loads that plant's retro sprite automatically.
8. **Health page:** The device moves to the overall plant health page (below).

**No close match:** If Gemini finds no close match in the vector storage, that case is not handled in the hackathon MVP. Later we will add a step that contacts the team to say a new plant data type is needed.

From then on, the agent answers the user's questions as they go, backed by the most recent data for that plant.

### Overall plant health page

This is the main screen after setup.

- **Health card:** An Apple Health-style card showing the overall plant health.
- **Sensor inputs:** All sensor readings, shown on the same page.
- **Mascot:** The plant's retro sprite in the top-left corner.
- **Ask button hint:** In the bottom-right corner, an arrow points down at the physical question button. The label reads "-v solution needed?". The button is how the user asks the AI questions about the plant.

### Health history page

A second screen, to the right of the main health page. The user swipes to it (touch is used only for swiping). It is part of the MVP.

- **Content:** Average plant health per hour, shown as a plotted line graph.
- **Style:** Same retro, simple, user-friendly style as the main page.
- **Data:** One point per day, which is the average of that day's overall health scores. The score comes from our overall health metric (placeholder now, researched later, see below).

### Overall plant health calculation

**Placeholder for now:** We decide the score ourselves from the sensor inputs. A simple rule-based score is enough for the hackathon.

**Later:** Replace it with a researched calculation based on our inputs. The software lead will do this research later.

## Hardware

From `hardware_info.md` (updated by Zion):

| Component | Part |
|-----------|------|
| Microcontroller (x1 in use) | ESP32 DevKit V1 — sensors + relay for the one MVP pot (second DevKit is spare) |
| Central computer | Raspberry Pi 5 (8 GB RAM, 256 GB SSD) — owns the 2.8" screen, camera, mic/speaker, UI + AI |
| Air quality sensor | Sensirion SEN63C |
| Temp / humidity sensor | DHT11 |
| Soil moisture sensor | Stemma I2C Soil Sensor |
| Camera | Raspberry Pi Camera 3 |
| Display | 2.8" SPI serial TFT touch screen (**wired to the Pi**, Chromium kiosk) |
| Relay | 5V relay module |
| Microphone | USB mic |
| Speaker | USB speaker |

Still missing from the list: the water pump.

Existing firmware is in `e2/` (PlatformIO, ESP32 DevKit V1). It reads the SEN63C over I2C and serves a live dashboard from a WiFi access point. It also drives an SSD1306 128x64 OLED (legacy AP dashboard only — not the product UI). The Adafruit seesaw library (for the soil sensor) is already listed as a dependency but isn't used in code yet.

## Data architecture (from the team's `docs/`)

The hardware team defined how sensor data moves. Our software sits on top of it. Full details are in `docs/architecture.md` and `docs/mqtt_contract.md`.

```
ESP32 (one pot: sensors + relay) --MQTT/JSON--> Raspberry Pi 5 (Mosquitto + deem_controller + 2.8" kiosk UI)
                                                      |
                                                      +-> SQLite buffer -> web endpoint (JSON, Connor is building it)
                                                      +-> Gemini, Fish Audio, MongoDB Atlas, camera, voice
```

- **One ESP32** reads the sensors and drives the relay for the demo pot. It publishes JSON readings to `deem/<device_id>/telemetry` and receives commands on `deem/<device_id>/cmd`.
- **The Pi** runs the Mosquitto broker, the `pi/deem_controller` Python service, and the **2.8" product display** (Chromium kiosk). It validates readings, buffers them in SQLite, and relays them to a pluggable web endpoint.
- **Web endpoint:** The data endpoints use JSON, and Connor is working on that. Our job is to collect input from all sensors in that JSON format, then do everything else in this document.
- **Reading format:** A flat `metrics` object with keys such as `co2_ppm`, `temp_c`, `rh_pct`, `pm1_0`, `pm2_5`, `pm4_0`, `pm10_0`, `soil_moisture` and `soil_temp_c`.
- **Commands:** `set_relay`, `set_interval`, `identify` and `reboot`. The pump runs through `set_relay`.
- **Current firmware change:** The `e2/` firmware currently runs as a WiFi access point with its own web page. The architecture docs retire that. The ESP32 becomes a WiFi client that publishes over MQTT.

### What this means for our features

- **10-minute collection:** Use `set_interval` to set the ESP32 publish rate to 600 seconds. The docs' sample code publishes every 5 seconds.
- **"Collect now" button:** The contract has no command for an immediate reading. We need to add one (for example a `sample_now` action) to `docs/mqtt_contract.md`, and the firmware has to publish a reading when it receives it.
- **Camera:** The contract has no camera support. The docs place the camera on the Pi. Our decision: capture a photo at every data collection, store it in MongoDB as one data point of that collection entry.
- **Pump state and button presses:** Neither is in the contract yet.

## Team and roles

- **Software lead:** Builds the connectors from hardware to software, plus the display, AI pipeline and data layer.
- **Two hardware partners (Zion and one other):** Make sure the software lead can get the data and that sensing works well.

## Resources

| Resource | Amount |
|----------|--------|
| Gemini API credits | $300 free |
| MongoDB Atlas spend | $150 (the $50 per person across three people) |
| Cursor | Full usage |

## Key decisions

- MIC and TEST are physical keyboard keys (not on the screen). Confirm/retry are on-screen touch buttons, and touch is also used for swiping. No typing: voice only.
- MVP uses **one ESP32** for the pot. The **Pi owns the 2.8" TFT** and runs the kiosk UI.
- Sensors log one data point every 10 minutes. The physical TEST key takes and displays a test input on demand, for the live demo. The health page shows the most recent test.
- The MVP is a single-plant display device. The master dashboard is the production product and only appears as a mock in the demo.
- Voice runs through Fish Audio. Reasoning runs through a Gemini model. Plant data and vectors live in MongoDB Atlas.
- Setup is voice-driven: the user says the plant type, Gemini matches it, and the user confirms.
- Every plant type in the database has a retro sprite linked to its vector storage, and the sprite appears in the top-left corner after setup.
- Sprites are generated after the MongoDB vector storage is set up with all MVP plant types.
- The overall health score is a placeholder we decide ourselves. It will be replaced by a researched calculation later.
- The camera captures a photo with every data collection. Each data entry stored in MongoDB for the plant includes the image as one of its data points. There is no computer vision in the MVP.
- Touch is used for the confirm/retry buttons and for swiping back and forth between screens.
- When something needs fixing, the screen shows a wilting, slightly gray version of the plant filling most of the screen, with one sentence on what to do (the same wilted image for every failure for now).
- Readings outside the plant's healthy range, or past blanket air-quality limits (CO2 above 1500 ppm, PM2.5 above 35, PM10 above 150), play an alert sound and show what is wrong. In the MVP every such reading alerts (nothing self-corrects). In the full-greenhouse dashboard, a biosphere controller will fix watering, temperature and humidity, and the device will alert only for what it cannot change, such as soil quality.
- Each point on the history graph is the average of that hour's overall health scores.
- A second swipeable screen to the right of the main health page shows average plant health per hour as a plotted graph. It is part of the MVP.
- All screens share one style: retro, simple and user friendly, so non-technical people can read the data easily.
- MVP plant types are golden pothos, common house plants, dracaena and panda plant. The live demo uses dracaena or panda plant (decide later).
- Handling "no close match" (contacting the team about a new plant type) is not in the hackathon MVP.
- The large-scale dashboard is a mock, built last, only to show scalability.

## Beyond the MVP

With better hardware and more time:

- Contact the team automatically when a user asks for a plant type we don't have data for.
- A computer vision model that tracks height, flowering and fruit bearing, depending on the plant.
- Timelapse pictures linked to decision changes.
- Health scoring over time.
- The production dashboard, linking many monitors together.

## Live demo plan

1. **Real, one plant:** Show the one plant we have, being monitored on the dashboard. This is the full loop:
   - sensor data collection
   - alerts to the user
   - Gemini, Fish Audio and MongoDB Atlas vector search coming up with solutions to problems
2. **Mock, large scale (last step):** Show a mock version of the master dashboard at large scale, with the full greenhouse model and many monitors. It is built: a standalone web app in `dashboard/` (its own Railway service, simulated data). A pixel-art greenhouse map where each plant opens the device display, then overall greenhouse health, health by plant type, and every plant. This is only to show scalability. The real, working system is the single-plant monitor above.

## Open questions

- The water pump isn't listed in `hardware_info.md` yet.
- The display's exact model number isn't listed, only its size and interface (Pi owns the panel; driver setup still needs the chip/product link).
- The DHT11 and SEN63C both map to `temp_c` and `rh_pct` in the contract, so one overwrites the other. Decide which one is the source of truth, or give them separate keys.
- The TEST button sends a new `sample_now` command (added to `docs/mqtt_contract.md`). The firmware needs to implement it.
- The `e2/` firmware still runs as a WiFi access point. When does it move to MQTT client mode?
- How are the sprites generated (an image model, hand-made, or a pixel-art tool)?
- Which dracaena or panda plant is the live demo plant? (Decide later.)
- What happens if the user rejects the matched plant at the confirm step? (Probably retry the voice input.)
- "Common house plants" is broad. Which specific plants does it include?
