# Greenhouse AI: Raspberry Pi (controller + kiosk)

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
The controller is set up to **POST batches to the web endpoint** (`sink.type:
http`). The exact ingest URL and auth token are still being finalized with the
webapp team, so they come from the environment — set `DEEM_SINK_URL` (and
`DEEM_SINK_TOKEN` if the endpoint needs auth) in the `.env` file (see step 4)
and nothing else changes. Until the endpoint is live, deliveries fail and
readings stay safely buffered in SQLite for retry.

> For local development you can still flip `sink.type: log` to just print each
> batch as it arrives instead of POSTing.

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
  - `type: http` — POST batches to `sink.url` (the configured default). The URL
    and any auth header are referenced as `${ENV_VAR}` and expanded at load
    time, so the webapp team's endpoint/token drop into the environment later
    without editing committed files.
  - `type: log` — print batches instead (handy for local development).

The relay goes to the Deem ingest service on Railway (it stores readings in the
Tiger database and feeds the dashboard). The URL is already in `config.example.yaml`;
only the secret token is needed. On the Pi, run once:
```bash
bash pi/deploy/setup-sink.sh     # asks for DEEM_SINK_TOKEN (hidden), saves it to pi/.env, tests it, restarts the service
```
Then check `https://authentic-perception-production-245b.up.railway.app/api/devices`
lists `esp32-pot-01` (within ~10 minutes of the next ESP32 sample).
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

> This section documents the exact setup running on the Deem Pi: a 2.8" ILI9341
> panel with an XPT2046 resistive touch controller, Raspberry Pi OS / Debian 13
> (Trixie), headless (no HDMI), so the fbtft panel is `/dev/fb0`.

### 1. Turn the SPI panel into a framebuffer
Append the overlays in `deploy/kiosk/config.txt.additions` to
`/boot/firmware/config.txt`, then reboot:
```ini
dtoverlay=fbtft,spi0-0,ili9341,bgr,reset_pin=25,dc_pin=24,rotate=0,speed=32000000,fps=30
dtoverlay=deem-touch
```
`rotate=0` gives the native 240x320 **portrait** framebuffer, which matches the
`demo/` UI's 3:4 design. Confirm it appears:
```bash
cat /sys/class/graphics/fb0/virtual_size   # -> 240,320
dmesg | grep -iE 'ili9341|ads7846'
```
On a Pi that also has an HDMI framebuffer, the panel may instead be `/dev/fb1`;
then set `DEEM_FB=/dev/fb1` in `deem-kiosk.service` and the `fbdev` path in
`deploy/kiosk/99-fbdev-tft.conf`.

### 2. Touch (XPT2046) with debounce
Wire **`T_IRQ` (PENIRQ) → GPIO17** (the driver only samples on this interrupt),
then build and load the touch overlay:
```bash
sudo dtc -@ -I dts -O dtb -o /boot/firmware/overlays/deem-touch.dtbo \
  deploy/kiosk/deem-touch-overlay.dts
# (deem-touch is already referenced in config.txt.additions; reboot to load)
```
The overlay binds the `ads7846` driver to CE1 and adds driver-level debouncing
(`ti,debounce-*`, `settle-delay`) the stock overlay lacks. After reboot the
panel registers as `ADS7846 Touchscreen` (`/dev/input/event*`).

### 3. Install X (no desktop) + Chromium
```bash
sudo apt install -y \
  xserver-xorg-core xserver-xorg-video-fbdev xinit x11-xserver-utils \
  matchbox-window-manager unclutter chromium
sudo cp deploy/kiosk/Xwrapper.config   /etc/X11/Xwrapper.config
sudo cp deploy/kiosk/99-fbdev-tft.conf /etc/X11/xorg.conf.d/
```

### 4. Build the UI in live mode
Bakes the broker URL + pot id into the build (`VITE_*` are compile-time):
```bash
cd ~/Deem/pi
# defaults: ws://localhost:9001 and esp32-pot-01 — override via env if needed
deploy/build-ui.sh            # produces demo/dist
```
Node 20+ is required to build (`deploy/build-ui.sh`); the UI is **served** at
display time by `deem-ui.service` using Python's stdlib `http.server`, so the Pi
needs no Node runtime once `demo/dist` exists.

### 5. Enable the services + boot straight to the kiosk
```bash
sudo cp deploy/deem-ui.service deploy/deem-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mosquitto
sudo systemctl enable --now deem-ui.service    # python http.server on :3000
sudo systemctl enable --now deem-kiosk.service # minimal X + Chromium on the TFT
# Boot to console (no desktop) so nothing else grabs the display / :0:
sudo systemctl set-default multi-user.target
sudo systemctl disable lightdm 2>/dev/null || true
```
`deem-kiosk.service` runs `deploy/kiosk/kiosk-session.sh`, which starts X on the
TFT framebuffer and runs `start-kiosk.sh` (Chromium `--kiosk`). Rerun
`deploy/build-ui.sh` and `sudo systemctl restart deem-ui` after pulling UI
changes.

### 6. Calibrate touch
Install the calibration InputClass, then tap-calibrate the four corners:
```bash
sudo cp deploy/kiosk/40-deem-touch.conf /etc/X11/xorg.conf.d/
# Guided 4-corner calibration (writes the CalibrationMatrix into that file):
sudo python3 deploy/kiosk/touch-calibrate.py   # then tap TL,TR,BR,BL
sudo systemctl restart deem-kiosk
```
The committed matrix is panel-specific (it corrects the resistive panel's Y-flip
for the portrait display); regenerate it for your hardware. `calib.html` is an
optional on-screen target sheet you can serve from `demo/dist` during calibration.

> Troubleshooting: no `/dev/fb0` → the overlay didn't load (step 1). X exits
> immediately → `journalctl -u deem-kiosk -f`; usually `lightdm`/labwc is holding
> `:0` (step 5 disables it) or `99-fbdev-tft.conf` points at the wrong `fbdev`.
> Display orientation wrong → change `rotate=` in the fbtft line (0/180 portrait,
> 90/270 landscape). Touch dead → confirm `T_IRQ` is on GPIO17 and the IRQ fires
> (`grep ads7846 /proc/interrupts` should climb as you press).

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
