#!/usr/bin/env bash
#
# Deem kiosk X client: the program xinit runs *inside* the minimal X server that
# kiosk-session.sh starts on the SPI TFT. No desktop environment is involved.
#
# It opens the already-built demo/ UI (served by deem-ui.service) in Chromium
# kiosk mode. The UI runs in live mode and subscribes to the ESP32's telemetry
# over the Pi's Mosquitto WebSocket listener (ws://localhost:9001), so the panel
# always shows the most recent reading + plant-health score.
set -euo pipefail

UI_URL="${DEEM_UI_URL:-http://localhost:3000}"

# DISPLAY is provided by xinit; fall back to :0 if run by hand.
export DISPLAY="${DISPLAY:-:0}"

# Keep the small panel awake: no screen blanking, no DPMS power-save.
xset s off || true
xset s noblank || true
xset -dpms || true

# Hide the mouse pointer (touch-only UI).
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0.5 -root &
fi

# A tiny window manager makes Chromium's fullscreen + input focus reliable.
# Optional: Chromium --kiosk mostly works without one, but matchbox is safest.
if command -v matchbox-window-manager >/dev/null 2>&1; then
  matchbox-window-manager -use_titlebar no &
fi

# Wait for the UI server to answer before opening the browser (avoids a
# "can't reach the site" flash when both services start at boot).
echo "waiting for Deem UI at ${UI_URL} ..."
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "${UI_URL}"; then
    break
  fi
  sleep 1
done

# Raspberry Pi OS ships Chromium as either chromium-browser or chromium.
BROWSER="$(command -v chromium-browser || command -v chromium || true)"
if [ -z "${BROWSER}" ]; then
  echo "chromium not found. Install it with:" >&2
  echo "  sudo apt install -y chromium-browser unclutter matchbox-window-manager" >&2
  exit 1
fi

# --app gives a chromeless window; --kiosk makes it full-screen with no exit UI.
# When Chromium exits, xinit tears down the X server and the service restarts.
exec "${BROWSER}" \
  --kiosk \
  --app="${UI_URL}" \
  --incognito \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000
