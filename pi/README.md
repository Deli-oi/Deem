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

## Sending a command to a device
```bash
.venv/bin/python -m deem_controller --config config.yaml send \
  --device esp32-aqi-01 --action set_relay --params '{"channel":1,"state":"on"}'
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
