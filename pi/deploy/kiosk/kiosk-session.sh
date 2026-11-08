#!/usr/bin/env bash
#
# Start a *minimal* X server directly on the SPI TFT framebuffer (no desktop)
# and launch the Deem kiosk client under it. Run by deem-kiosk.service on tty1.
#
# How it works on a headless Pi (Raspberry Pi OS Lite):
#   1. The display overlay (set in config.txt) exposes the SPI panel as a Linux
#      framebuffer, usually /dev/fb1.
#   2. The fbdev Xorg driver (deploy/kiosk/99-fbdev-tft.conf) binds X to that fb.
#   3. xinit starts X on tty1 and runs start-kiosk.sh (Chromium kiosk) in it.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

# The SPI TFT framebuffer. Override if your overlay creates a different node.
export FRAMEBUFFER="${DEEM_FB:-/dev/fb1}"

if [ ! -e "${FRAMEBUFFER}" ]; then
  echo "framebuffer ${FRAMEBUFFER} not found." >&2
  echo "Enable your panel's display overlay in /boot/firmware/config.txt and reboot." >&2
  echo "Check with: dmesg | grep -i 'fb\\|ili9341\\|st77\\|tft'  and  ls /dev/fb*" >&2
  exit 1
fi

export DEEM_UI_URL="${DEEM_UI_URL:-http://localhost:3000}"

# Start X on the first console and run the kiosk client. -keeptty keeps us on
# tty1 (we were started there by systemd); -nocursor hides the X pointer.
exec xinit "${HERE}/start-kiosk.sh" -- :0 vt1 -keeptty -nocursor
