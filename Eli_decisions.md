# Eli — UI decisions

What Eli asked for on the device screen. Newest first. Hardware and cloud calls that are not about the screen are in `decisions.md`.

## 2026-11-07: Test the current screen on Railway

- Push the new UI so it can be opened and tested.
- Live check: https://deem-production.up.railway.app

## 2026-11-07: Take every MQTT reading the contract defines

- The screen has to accept the inputs in `docs/mqtt_contract.md`.
- That list is `co2_ppm`, `temp_c`, `rh_pct`, `pm1_0`, `pm2_5`, `pm4_0`, `pm10_0`, `soil_moisture`, `soil_temp_c`.
- A device may send only the keys it actually has. Extra numeric keys should still show.

## 2026-11-07: Only the 2.8" screen, buttons under it

- The page is the monitor. No title, no captions, no fixture chips, no extra chrome.
- Four mock hardware buttons sit directly under the screen: Ask, Collect, Confirm, Water. Later these stand-ins are replaced by the real ESP buttons.
- Confirm, retry, and match are buttons **on the touchscreen**, not only on the hardware row.
- Swipe still moves between screens.
- Style is the Apple Activity card (stats on the left, concentric rings on the right, secondary numbers along the bottom) but **more retro**: chunky, pixel, simple. Reference was the Activity screenshot plus the simpler dracaena sprite.

## 2026-11-07: Simpler dracaena sprite first

- Generate one dracaena image to check the look before making the rest.
- The first sprite was acceptable, then Eli asked for it **a bit more simple**.
- After that style is approved, make one sprite per plant type in the set of 12 and attach each to that plant in the mock data so setup can pull it.

## 2026-11-07: Local mock of the whole device, before hardware

- Build the full UI against a mock backend that can be swapped out later.
- Load several JSON files as data pulls for the dracaena demo.
- Run it as a scaled version of the display locally.
- Setup has to work end to end: say or type the plant, match it, confirm, sensor check, then the health page.
- Both pages work, and swipe works between them.
- Test buttons sit below the fake screen.

## 2026-11-07: What the product screen is

From the software-lead product pass, still in force unless a later bullet above replaces it:

- One plant. Glanceable. Retro, simple, readable by non-technical people. Same style on every screen.
- Main health page, plus a history page to its right.
- Touch is for swiping between those screens. Everything else was physical buttons. (Later the same day, confirm/match/retry were also put on the touchscreen.)
- One headline health score. Sensor readings shown clearly. Plant sprite in the top-left.
- History is one point per day: the average of that day's health scores.
- A hint on the health page points down at the physical ask button.
- Camera is not on this screen for the first iteration.
