# Deem Pi Central Controller

Python service that runs on the Raspberry Pi 5. It ingests telemetry from the
ESP32 devices over MQTT, buffers it durably, and relays normalized readings to a
web endpoint. It also sends commands back down to the devices.

See `../docs/architecture.md` for the big picture and `../docs/mqtt_contract.md`
for the wire format.

## Layout
```
pi/
├── deem_controller/        # the service package
│   ├── __main__.py         # entry point + `send` CLI
│   ├── config.py           # YAML config -> dataclasses
│   ├── models.py           # Telemetry / Command models
│   ├── buffer.py           # durable SQLite buffer (retry + dead-letter)
│   ├── sink.py             # pluggable relay: LogSink / HttpSink
│   ├── mqtt_client.py      # paho-mqtt wrapper
│   └── controller.py       # wires ingest -> buffer -> relay
├── deploy/
│   ├── mosquitto.conf      # example broker config
│   └── deem-controller.service   # systemd unit
├── config.example.yaml
└── requirements.txt
```

## Setup on the Pi

### 1. Install the MQTT broker
```bash
sudo apt update && sudo apt install -y mosquitto mosquitto-clients
sudo cp deploy/mosquitto.conf /etc/mosquitto/conf.d/deem.conf
sudo systemctl enable --now mosquitto
```

### 2. Install the controller
```bash
cd ~/Deem/pi
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp config.example.yaml config.yaml      # then edit config.yaml
```

### 3. Run it
```bash
.venv/bin/python -m deem_controller --config config.yaml
```
With `sink.type: log` (the default) you'll see each batch of readings printed as
they arrive — handy while the real web endpoint is still TBD.

### 4. Run as a service (optional)
```bash
sudo cp deploy/deem-controller.service /etc/systemd/system/
# edit User/paths inside the unit if your layout differs
sudo systemctl daemon-reload
sudo systemctl enable --now deem-controller
journalctl -u deem-controller -f
```

## Configuration
Everything lives in `config.yaml` (copy from `config.example.yaml`). Key bits:

- `mqtt.*` — broker host/port/credentials and the `base_topic` (`deem`).
- `buffer.*` — SQLite path and max retained rows.
- `sink.*` — where readings go:
  - `type: log` — print batches (development default).
  - `type: http` — POST batches to `sink.url`. Set headers/auth there.
    Secrets can be referenced as `${ENV_VAR}` and are expanded at load time.

When the web endpoint is finalized, switching to it is usually just:
```yaml
sink:
  type: http
  url: https://the-real-endpoint/ingest
  headers:
    Authorization: Bearer ${DEEM_SINK_TOKEN}
```
If the endpoint expects a different JSON shape than `{"readings": [...]}`, edit
`HttpSink.build_body()` in `deem_controller/sink.py`.

## Touchscreen display (kiosk)
The Pi's 2.8" touchscreen shows the live **plant-health** UI (the `demo/` app).
It subscribes to the ESP32 over Mosquitto's WebSocket listener (`:9001`, already
in `deploy/mosquitto.conf`) and refreshes on every telemetry message, so the
screen always shows the most recent reading + health score. This runs *alongside*
the controller: the UI is just a live view, while `deem_controller` is what
aggregates readings, relays them to the cloud, and wipes local storage on success.

### 1. Build the UI in live mode
Bakes the broker URL + pot id into the build (`VITE_*` are compile-time):
```bash
cd ~/Deem/pi
# defaults: ws://localhost:9001 and esp32-pot-01 — override via env if needed
deploy/build-ui.sh
# e.g. a second pot: VITE_DEVICE_ID=esp32-pot-02 deploy/build-ui.sh
```
Node 20+ is required (`sudo apt install -y nodejs npm` or nvm).

### 2. Install the browser + services
```bash
sudo apt install -y chromium-browser unclutter
sudo cp deploy/deem-ui.service deploy/deem-kiosk.service /etc/systemd/system/
# edit User/paths inside the units if your layout differs
sudo systemctl daemon-reload
sudo systemctl enable --now deem-ui.service    # serves demo/dist on :3000
sudo systemctl enable --now deem-kiosk.service # full-screen Chromium on the panel
```
`deem-ui.service` serves the built UI; `deem-kiosk.service` runs
`deploy/kiosk/start-kiosk.sh`, which waits for the UI, disables screen blanking,
and opens Chromium in `--kiosk` mode. Rerun `deploy/build-ui.sh` and
`sudo systemctl restart deem-ui` after pulling UI changes.

> The kiosk service must run as the user that owns the Pi's graphical (X)
> session; check `DISPLAY`/`XAUTHORITY` in `deem-kiosk.service` if the window
> doesn't appear.

## Sending a command to a device
```bash
.venv/bin/python -m deem_controller --config config.yaml send \
  --device esp32-pot-01 --action set_relay --params '{"channel":1,"state":"on"}'
```

## Quick local sanity checks
```bash
# verify imports
.venv/bin/python -c "import deem_controller; print(deem_controller.__version__)"

# watch raw MQTT traffic from the devices
mosquitto_sub -h localhost -t 'deem/#' -v
```

## Design notes
- **Durability:** every reading is written to SQLite on arrival, so a crash or a
  down endpoint never loses data. The relay worker drains the buffer in batches.
- **Backpressure/retries:** failed deliveries are retried with exponential
  backoff; after `sink.max_retries` they move to a `dead` table for inspection.
- **Pluggable sink:** the web endpoint is intentionally abstracted so the rest of
  the system isn't blocked on that decision.
