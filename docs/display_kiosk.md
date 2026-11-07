# Putting the web app on the 2.8" display

Status: **not verified on real hardware.** The app side is ready; the display side needs two answers (below).

## 1. Open questions

1. ~~Which device is the TFT wired to?~~ **Resolved (2026-11-07): the TFT is on the Pi 5.** So the web app is the screen UI. (`docs/architecture.md` still says the ESP32 drives "its local OLED/TFT"; that now only applies to the small OLED in the `e2/` firmware, not the 2.8" TFT.)
2. **What is the exact module?** `hardware_info.md` only says "2.8" SPI Serial TFT Display" and lists it as a touch screen. We are waiting on the product link from Zion. We need the display controller (very likely ILI9341, 240x320) and the touch controller (very likely XPT2046). The driver setup depends on it.

## What Connor's Pi screen integration must match

Connor owns getting the page onto the panel. The web app expects:

| Item | Requirement |
|------|-------------|
| URL | `http://localhost:3000/?kiosk` (`npm start` in `demo/`; `?kiosk` makes the page the screen) |
| Resolution | **240x320, portrait.** The UI is a 300x400 (3:4) canvas scaled to the viewport (0.8x). Landscape 320x240 would shrink it to 0.6x. |
| Browser | Chromium in kiosk mode, microphone allowed for `localhost` |
| Touch | Pointer events from the panel's touch driver. Used only for the confirm/retry buttons and left/right swipes. |
| Keys | A keyboard (the mechanical keys) delivering key events to the browser: `KeyM` = MIC (hold), `KeyT` = TEST. Remap in `demo/src/lib/keys.ts`. |
| Audio | USB mic as the browser's default input (voice); USB speaker as default output |
| Network | `/api/transcribe` is served by the same `npm start` process. The Pi needs internet to reach Fish Audio. Env var `FISH_AUDIO_API_KEY` set for that process. |
| Live data | Build with `VITE_BACKEND=mqtt` and `VITE_MQTT_URL=ws://localhost:9001`, `VITE_DEVICE_ID=esp32-pot-01` (see `demo/README.md`) |

## 2. What the app already does

- **Fit:** `http://<host>/?kiosk` makes the page the screen itself: no bezel, no cursor, no scrolling. The UI is designed on a 300x400 (3:4, portrait) canvas and scaled to the viewport: **240x320 gets exactly 0.8x.** Labels are kept at 8px or larger on the panel. Checked at 240x320: all three pages fit with no overflow.
- **Portrait only:** The panel must be set to **portrait** (240 wide, 320 tall). In landscape (320x240) the canvas would shrink to 0.6x.
- **Physical keys:** MIC (hold to talk) and TEST are keyboard keys, `KeyM` and `KeyT` by default. Remap them in `demo/src/lib/keys.ts` to the real keys (e.g. `F13`, `Numpad0`).
- **Touch:** Used for confirm/retry buttons and swiping between pages. The panel's touch layer needs its own driver (section 3) to produce pointer events.

## 3. Pi 5 display path (to verify once we know the module)

Findings from Raspberry Pi forum threads (not tested by us):

- The old `fbtft` overlay and `fbcp`-style mirroring **do not work on the Pi 5**.
- The replacement is the kernel's `panel-mipi-dbi` DRM driver, loaded with the `mipi-dbi-spi` device-tree overlay, with the panel's init sequence supplied as a firmware file. Reported config for a 2.8" panel: `dtoverlay=mipi-dbi-spi,speed=48000000` plus the panel's width/height/compatible string.
- Reported pitfalls: mirrored image and inverted colors (fixable in the overlay/rotation settings); Mesa needing a patch for `panel-mipi-dbi`.
- Touch (XPT2046) normally uses the `ads7846` overlay.
- Chromium kiosk on that DRM display is **not covered** by those threads and needs testing.

Sources: [forum: Pi 5 SPI screens](https://forums.raspberrypi.com/viewtopic.php?t=365731), [forum: SPI display on Pi 5](https://forums.raspberrypi.com/viewtopic.php?t=358478), [forum: 2.8" ILI9341 on Pi 5](https://forums.raspberrypi.com/viewtopic.php?t=397575), [forum: mirroring desktop on Pi 5](https://forums.raspberrypi.com/viewtopic.php?t=399018).

Fallback if the SPI path fights us: run the UI on an HDMI display (or a small DSI/HDMI screen) for the demo. The same `?kiosk` URL works there unchanged.

## 4. Running the app on the Pi

```bash
cd demo
npm install && npm run build
FISH_AUDIO_API_KEY=<your key> npm start        # serves the app + /api/transcribe on :3000
chromium --kiosk --noerrdialogs "http://localhost:3000/?kiosk"
```

The key stays on the Pi (or in Railway's variables). It is never sent to the browser. Chromium asks for microphone permission once; allow it for `localhost`.

For live sensor data, build with `VITE_BACKEND=mqtt` (see `demo/README.md`).
