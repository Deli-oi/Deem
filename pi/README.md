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

## Touchscreen display (kiosk, SPI TFT, no desktop)
The Pi's 2.8" SPI TFT shows the live **plant-health** UI (the `demo/` app) as its
*only* display — Raspberry Pi OS **Lite**, no desktop environment. The UI
subscribes to the ESP32 over Mosquitto's WebSocket listener (`:9001`, already in
`deploy/mosquitto.conf`) and refreshes on every telemetry message, so the panel
always shows the most recent reading + health score. This runs *alongside* the
controller: the UI is just a live view, while `deem_controller` aggregates
readings, relays them to the cloud, and wipes local storage on success.

Because there's no desktop, the kiosk service starts its **own minimal X server**
directly on the TFT framebuffer and launches Chromium under it (`xinit` +
`fbdev`), taking over `tty1`.

### 1. Turn the SPI panel into a framebuffer
Enable SPI and your panel's display overlay in `/boot/firmware/config.txt`
(older Pi OS: `/boot/config.txt`), then reboot. The exact `dtoverlay` line
depends on your panel:
```ini
dtparam=spi=on
# Adafruit 2.8" resistive PiTFT (ILI9341 + touch), for example:
dtoverlay=pitft28-resistive,rotate=90,speed=64000000,fps=30
# Generic ILI9341 panels instead use an fbtft overlay; ST7789 panels differ again.
```
Confirm the framebuffer appears (usually `/dev/fb1`):
```bash
ls /dev/fb*
dmesg | grep -iE 'fb|ili9341|st77|tft'
```
If it's not `/dev/fb1`, set `DEEM_FB=/dev/fbN` in `deem-kiosk.service` and the
`fbdev` path in `deploy/kiosk/99-fbdev-tft.conf`.

### 2. Install X (no desktop) + Chromium
```bash
sudo apt install -y \
  xserver-xorg-core xserver-xorg-video-fbdev xinit x11-xserver-utils \
  matchbox-window-manager unclutter chromium-browser
# Let the kiosk start X from a systemd service (not a console login):
echo 'allowed_users=anybody' | sudo tee /etc/X11/Xwrapper.config
sudo cp deploy/kiosk/99-fbdev-tft.conf /etc/X11/xorg.conf.d/
```

### 3. Build the UI in live mode
Bakes the broker URL + pot id into the build (`VITE_*` are compile-time):
```bash
cd ~/Deem/pi
# defaults: ws://localhost:9001 and esp32-pot-01 — override via env if needed
deploy/build-ui.sh
# e.g. a second pot: VITE_DEVICE_ID=esp32-pot-02 deploy/build-ui.sh
```
Node 20+ is required (`sudo apt install -y nodejs npm` or nvm).

### 4. Enable the services
```bash
sudo cp deploy/deem-ui.service deploy/deem-kiosk.service /etc/systemd/system/
# edit User/paths inside the units if your layout differs
sudo systemctl daemon-reload
sudo systemctl enable --now deem-ui.service    # serves demo/dist on :3000
sudo systemctl enable --now deem-kiosk.service # minimal X + Chromium on the TFT
```
`deem-ui.service` serves the built UI; `deem-kiosk.service` runs
`deploy/kiosk/kiosk-session.sh`, which starts X on the TFT framebuffer and runs
`start-kiosk.sh` (Chromium `--kiosk`). Rerun `deploy/build-ui.sh` and
`sudo systemctl restart deem-ui` after pulling UI changes.

### Try it once before enabling at boot
```bash
cd ~/Deem/demo && PORT=3000 npm start &     # serve the UI
sudo systemctl stop getty@tty1              # free tty1
sudo DEEM_FB=/dev/fb1 DEEM_UI_URL=http://localhost:3000 \
  ~/Deem/pi/deploy/kiosk/kiosk-session.sh   # should paint the UI on the TFT
```

> Troubleshooting: no `/dev/fb1` → the overlay didn't load (step 1). X exits
> immediately → check `journalctl -u deem-kiosk -f` and that
> `99-fbdev-tft.conf` points at the right `fbdev`. Blank panel but no errors →
> wrong `rotate=`/driver for your controller.

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
