#!/usr/bin/env bash
# One-step setup of the Pi -> cloud relay. Run ON THE PI from the repo:
#     bash pi/deploy/setup-sink.sh
#
# It: creates pi/config.yaml from the example if missing, stores the sink token in pi/.env
# (gitignored, mode 600), tests the token against the ingest service WITHOUT sending data,
# and restarts the controller. The token is asked for interactively and is never printed.
set -euo pipefail

PI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INGEST_BASE="https://authentic-perception-production-245b.up.railway.app"
ENV_FILE="$PI_DIR/.env"

[ -f "$PI_DIR/config.yaml" ] || { cp "$PI_DIR/config.example.yaml" "$PI_DIR/config.yaml"; echo "created pi/config.yaml from the example"; }

if grep -q '^DEEM_SINK_TOKEN=.\+' "$ENV_FILE" 2>/dev/null; then
  echo "pi/.env already has a DEEM_SINK_TOKEN (kept). Delete that line to set a new one."
else
  read -r -s -p "Paste the DEEM_SINK_TOKEN (input is hidden): " TOKEN; echo
  [ -n "$TOKEN" ] || { echo "no token entered"; exit 1; }
  touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
  grep -v '^DEEM_SINK_TOKEN=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
  printf 'DEEM_SINK_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"; chmod 600 "$ENV_FILE"
  unset TOKEN
  echo "saved the token to pi/.env"
fi

# Test the token with an empty batch: 200 = token accepted, 401 = wrong token. Nothing is stored.
TOKEN_FROM_FILE="$(grep '^DEEM_SINK_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
CODE="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$INGEST_BASE/ingest" \
  -H "Authorization: Bearer $TOKEN_FROM_FILE" -H 'Content-Type: application/json' -d '{"readings":[]}' || true)"
unset TOKEN_FROM_FILE
case "$CODE" in
  200) echo "OK: the ingest service accepted the token" ;;
  401) grep -v '^DEEM_SINK_TOKEN=' "$ENV_FILE" > "$ENV_FILE.tmp" || true; mv "$ENV_FILE.tmp" "$ENV_FILE"; chmod 600 "$ENV_FILE"
       echo "FAIL: the ingest service rejected the token (wrong token). The bad token was removed from pi/.env: run this script again."; exit 1 ;;
  000) echo "FAIL: could not reach $INGEST_BASE (no internet or DNS on the Pi)"; exit 1 ;;
  *)   echo "FAIL: unexpected HTTP $CODE from the ingest service"; exit 1 ;;
esac

if systemctl list-unit-files deem-controller.service >/dev/null 2>&1 && systemctl cat deem-controller.service >/dev/null 2>&1; then
  sudo systemctl restart deem-controller && echo "restarted deem-controller"
  sleep 3; systemctl is-active deem-controller || true
else
  echo "deem-controller service is not installed here: start it with: cd pi && .venv/bin/python -m deem_controller --config config.yaml"
fi
echo "Readings reach the cloud within ~10 minutes of the next ESP32 sample. Check: $INGEST_BASE/api/devices"
