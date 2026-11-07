# Deem

All-in-one affordable plant monitoring + automation platform for greenhouses.

## Architecture (short version)
ESP32s own sensors, the display, and buttons. The Raspberry Pi 5 owns MQTT
ingest plus **voice/alarms** (mic + speaker), and talks to cloud MongoDB /
Railway over HTTPS.

```
ESP32(s)  ──MQTT──▶  Raspberry Pi 5  ──HTTPS──▶  MongoDB Atlas + Railway
 sensors   ◀─cmds──   voice + ctrl              plant knowledge / APIs
 display
 buttons
```

See **`docs/architecture.md`** for the full picture and **`docs/build_plan.md`**
for the software build order.

## Repository layout
| Path | What |
|------|------|
| `e2/` | ESP32 firmware (PlatformIO) |
| `pi/` | Raspberry Pi central controller (Python) — see `pi/README.md` |
| `docs/architecture.md` | system overview |
| `docs/build_plan.md` | software build plan (demo, fixtures, phases) |
| `docs/plant_data_research.md` | plant knowledge DB research for Atlas seed |
| `docs/mqtt_contract.md` | **MQTT interface spec** both tiers code against |
| `docs/esp32_integration.md` | firmware-side integration guide + example code |
| `hardware_info.md` | bill of materials |
| `decisions.md` | project decision log |

## Getting started
- **Local device demo (UI + mock backend):** `cd demo && npm install && npm run dev` → http://127.0.0.1:5173/ (see `demo/README.md`)
- **Dev workflow (branch / PR / no forks):** `docs/dev_workflow.md`
- **Pi / controller:** `pi/README.md`
- **ESP32 / firmware:** `docs/esp32_integration.md`
- **Plant seed JSON:** `data/plants/`

## Iteration practice
Same repo only — branch off `main`, push, open a PR, merge, pull. Close stale PRs; don’t fork.
