# Deem build plan (software)

Ordered for a hackathon MVP. Hardware (ESP sensors/display/buttons) is Zion’s
lane. Software owns cloud data, AI/voice on the Pi, Railway hosting, and a
**local scaled demo** that proves the product loop before real hardware wires in.

## Architecture (locked 2026-11-07)

```
ESP32(s)                          Raspberry Pi 5                      Cloud
────────                          ──────────────                      ─────
sensors                           MQTT broker (Mosquitto)             MongoDB Atlas
display (2.8" TFT)                deem_controller (ingest/buffer)     (plant knowledge
buttons (incl. collect/ask)       Fish Audio (mic in + alarm out)       + live plant data
relay / pump                      Gemini client                         + sprites)
     │                                 │                              Railway (app /
     └──────── MQTT/JSON ──────────────┘── HTTPS ──────────────────▶    APIs / hosting)
```

| Owner | Owns |
|-------|------|
| **ESP** | Sensors, display UI, physical buttons, relay |
| **Pi** | MQTT ingest/buffer/relay, **microphone + speaker** (voice + alarms), Gemini/Fish clients, camera deferred |
| **Cloud** | MongoDB Atlas over the internet; **Railway** hosts software services |

Camera is **out of first iteration** (storage cost, low health signal for MVP).

## What is `sample_now`?

Earlier we noted the MQTT contract had no way for the **Pi** to demand an
immediate reading (needed when “collect now” lived as a software concern).

With the new split, **the ESP owns the collect-now button**. Practical path:

1. User presses collect-now on the ESP.
2. ESP samples sensors, updates its display, and publishes a normal
   `deem/<id>/telemetry` message immediately (does not wait for the 10‑min interval).

So we may **not need a Pi→ESP `sample_now` command** for MVP. Optional later if
the cloud/Pi must force a sample without a button press. Do not block on adding
it unless Zion wants Pi-triggered sampling.

## Phases

### Phase 0 — Research & connectors (now)
- [x] Research plant care / health datasets → see `docs/plant_data_research.md`
- [ ] Software lead connects MongoDB Atlas, Gemini, Fish Audio (secrets)
- [x] Railway project linked to Deem GitHub (project `594f967f-…`, service `f3619240-…`, env `8bc02acd-…`)
- [ ] Add `RAILWAY_TOKEN` (and later Mongo/Gemini/Fish) as Cursor secrets so the agent can deploy/configure
- [ ] Decide Open Plantbook as seed source (recommended)

**Secrets plan:** Prefer **Railway env vars** for runtime + **Cursor/cloud-agent
secrets** for this environment. GitHub Actions secrets only if we add CI that
calls Gemini. Do not commit keys. Gemini via Google AI Studio API key is fine
for hackathon; GitHub secret is optional, not required for local/agent work.

### Phase 1 — Plant knowledge base
- [x] Finalize 12 plant types + collect seed JSON from MiFloraDB (`data/plants/`)
- [ ] Upsert seed into Atlas + vector index on `embedding_text` / care+solutions
- [ ] One reference sprite for one plant; then generate + attach sprites per type
- [ ] Spot-check dracaena + panda plant documents end-to-end against live Atlas

### Phase 2 — Local demo environment (before / parallel to hardware)
Scaled fake device in the browser (`demo/`):

- [x] **Fixture suite:** dracaena JSON telemetry (healthy, dry soil, high CO2, cold, overwatered)
- [x] Fixture chips + collect-now against mock backend (`DeemBackend` interface)
- [x] **Scaled display mock** of the ESP screen (health + history, retro style)
- [x] **Setup workflow (mocked):** text/voice stand-in → local plant match → confirm → sensor check → health
- [x] **Swipe** between health page and day-by-day history graph
- [x] **Test buttons below the fake screen:** voice/ask, collect-now, confirm, water
- [ ] Wire setup match + ask to real Atlas vectors / Gemini (keep UI; swap backend)
- [ ] Later: swap button stubs for real ESP button events over MQTT

### Phase 3 — Pi software services
- [ ] Keep `deem_controller` as ingest path; point `HttpSink` at Railway/Atlas
      ingest as needed
- [ ] Fish Audio: mic capture → STT; TTS for alarms + answers
- [ ] Gemini agent: setup matching + Q&A over Atlas + latest metrics
- [ ] Alarm rules: when metrics leave thresholds, Pi speaks alert (ESP may also
      show on-screen alert)
- [ ] Rule-based overall health score (placeholder) + daily averages for history

### Phase 4 — ESP ↔ software contract
- [ ] Firmware moves to MQTT client (Zion); software stays on `mqtt_contract.md`
- [ ] Confirm metric keys (resolve DHT11 vs SEN63C `temp_c`/`rh_pct` clash)
- [ ] Button events: either implied by telemetry timing, or add a small
      `deem/<id>/event` topic if we need ask/collect distinct from readings
- [ ] Display remains ESP-owned; Pi does not render the TFT

### Phase 5 — Integration + demo
- [ ] One real plant (dracaena or panda) on hardware + Atlas live data
- [ ] Demo script: setup → health → swipe history → ask AI → collect-now
- [ ] Last: mock multi-plant greenhouse dashboard (scalability slide only)

## Explicit non-goals (this iteration)
- Camera / image storage
- Computer vision
- Production multi-plant dashboard (mock only)
- “No plant match → contact team” flow
- Researched health formula (placeholder rules only)

## Dependency order (critical path)

```
Plant data research ──▶ Atlas seed + vectors ──▶ Setup + Gemini RAG
                                         └──▶ Local demo UI + fixtures
Connectors (Mongo/Gemini/Fish/Railway) ──▶ Phase 2–3 implementation
ESP MQTT + buttons (Zion) ──────────────▶ Swap stubs for hardware
```

Development of the **local demo + fixtures** can start as soon as Atlas + Gemini
keys are available, without waiting on ESP firmware.
