# Deem

All-in-one affordable plant monitoring + automation platform for greenhouses.

## Architecture (short version)
ESP32 devices handle the physicals (sensors + relays). A Raspberry Pi 5 acts as
the central controller: it ingests telemetry from the ESP32s over MQTT, buffers
it, relays it to a web endpoint, and sends commands back down.

```
ESP32(s)  ──MQTT──▶  Raspberry Pi 5  ──HTTPS──▶  web endpoint (TBD)
 sensors   ◀─cmds──   central ctrl    ◀───────    cloud / dashboard
 + relays
```

See **`docs/architecture.md`** for the full picture.

## Repository layout
| Path | What |
|------|------|
| `e2/` | ESP32 firmware (PlatformIO) |
| `pi/` | Raspberry Pi central controller (Python) — see `pi/README.md` |
| `docs/architecture.md` | system overview |
| `docs/mqtt_contract.md` | **MQTT interface spec** both tiers code against |
| `docs/esp32_integration.md` | firmware-side integration guide + example code |
| `hardware_info.md` | bill of materials |
| `decisions.md` | project decision log |

## Getting started
- **Pi / controller:** `pi/README.md`
- **ESP32 / firmware:** `docs/esp32_integration.md`
