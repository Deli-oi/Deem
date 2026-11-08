#!/usr/bin/env bash
#
# Launch the Deem plant-health UI full-screen on the Pi's 2.8" touchscreen.
#
# This opens the already-built demo/ UI (served by deem-ui.service) in Chromium
# kiosk mode. The UI runs in live mode and subscribes to the ESP32's telemetry
# over the Pi's Mosquitto WebSocket listener (ws://localhost:9001), so the screen
# always shows the most recent reading + plant-health score.
#
# Meant to be run by deem-kiosk.service inside the Pi's graphical session.
set -euo pipefail

UI_URL="${DEEM_UI_URL:-http://localhost:3000}"

# Wait for the UI server to come up before opening the browser (avoids a
# "can't reach the site" flash when both services start at boot).
echo "waiting for Deem UI at ${UI_URL} ..."
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "${UI_URL}"; then
    break
  fi
  sleep 1
done

# Keep the small panel awake: no screen blanking, no DPMS power-save.
export DISPLAY="${DISPLAY:-:0}"
xset s off || true
xset s noblank || true
xset -dpms || true

# Hide the mouse pointer if unclutter is installed (touch-only UI).
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0.5 -root &
fi

# Raspberry Pi OS ships Chromium as either chromium-browser or chromium.
BROWSER="$(command -v chromium-browser || command -v chromium || true)"
if [ -z "${BROWSER}" ]; then
  echo "chromium not found. Install it with:" >&2
  echo "  sudo apt install -y chromium-browser unclutter" >&2
  exit 1
fi

# --app gives a chromeless window; --kiosk makes it full-screen with no exit UI.
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
