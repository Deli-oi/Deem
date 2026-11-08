# What the screen app needs from the firmware (for Zion)

The app already matches your firmware's message format (there is a test with your exact messages: `demo/src/lib/firmware.test.ts`). The decisions we made (10-minute samples, no commands, no pump, DHT11 for temp/humidity, thresholds in the app) need **four small changes** in `hackathon2026/` so the screen can start up properly. Nothing here has been compiled or run on the board: it is written against your current code.

## Why

With one reading every 10 minutes, the screen can't wait for "the next sample" when it starts: that could be 10 minutes. So:

- the device keeps its **latest sample on the broker** (retained), and
- it tells the screen **which sensors started**, so the setup loading screen can show each one coming up (or failing) for real.

## 1. Sample every 10 minutes

```ini
; platformio.ini
build_flags = -DSAMPLE_INTERVAL_S=600
```

(You said you'd change this. The 30 s default is only for testing.)

## 2. Retain the telemetry (`mqtt_link.h`, in `link_flush`)

The last argument `true` makes it retained, so anything that connects later gets the latest sample at once.

```cpp
// before
if (!_link_mqtt.publish(_link_topic_tel, (const uint8_t *)buf, (unsigned int)n, false)) break;
// after
if (!_link_mqtt.publish(_link_topic_tel, (const uint8_t *)buf, (unsigned int)n, true)) break;
```

QoS 0 is fine; the contract was updated to say so.

## 3. Report which sensors started (`status` message)

Add the results of the three `begin()` calls to the retained `online` status.

`mqtt_link.h`:

```cpp
static bool _link_sensor_ok[3] = {false, false, false};   // dht, air, soil (the order setup() starts them)
static bool _link_status_dirty = true;

/* Call from setup() after the begin() calls, and again whenever a sensor drops out or recovers. */
static inline void link_set_sensors(bool dht, bool air, bool soil) {
  if (_link_sensor_ok[0] == dht && _link_sensor_ok[1] == air && _link_sensor_ok[2] == soil) return;
  _link_sensor_ok[0] = dht;
  _link_sensor_ok[1] = air;
  _link_sensor_ok[2] = soil;
  _link_status_dirty = true;
}

static inline void link_publish_status() {
  char buf[160];
  int n = snprintf(buf, sizeof(buf),
                   "{\"state\":\"online\",\"fw\":\"" FW_VERSION "\",\"sensors\":{\"dht\":%s,\"air\":%s,\"soil\":%s}}",
                   _link_sensor_ok[0] ? "true" : "false",
                   _link_sensor_ok[1] ? "true" : "false",
                   _link_sensor_ok[2] ? "true" : "false");
  if (n > 0 && _link_mqtt.publish(_link_topic_status, (const uint8_t *)buf, (unsigned int)n, true)) {
    _link_status_dirty = false;
  }
}
```

In `link_loop()`, replace the existing "publish online" block with `_link_status_dirty = true;` right after a successful connect, and add this just before `_link_mqtt.loop();`:

```cpp
  if (_link_status_dirty) link_publish_status();
```

`main.cpp`:

```cpp
void setup() {
  Serial.begin(115200);
  link_begin();

  bool dhtOk  = dht.begin();
  bool airOk  = air.begin();
  bool soilOk = soil.begin();
  Serial.println(dhtOk  ? "DHT sensor initialized"  : "DHT sensor failed");
  Serial.println(airOk  ? "Air sensor initialized"  : "Air sensor failed");
  Serial.println(soilOk ? "Soil sensor initialized" : "Soil sensor failed");
  link_set_sensors(dhtOk, airOk, soilOk);
  // ... the CSV header code stays as it is
}

void loop() {
  link_loop();
  // ... existing sensor updates ...
  link_set_sensors(dht.isAvailable(), air.isAvailable(), soil.isAvailable());   // reports a sensor that drops out
  // ... existing sampling and flush code ...
}
```

The status message then looks like this (the `sensors` field is optional for the app: if you leave it out, the screen waits for each sensor's readings instead, and gives up after a minute):

```json
{"state":"online","fw":"0.1.0","sensors":{"dht":true,"air":true,"soil":true}}
```

## 4. Point the clock at the Pi

If the board can't reach `pool.ntp.org` (a LAN with no internet), every sample has `ts: 0`. With retained telemetry, a stored `ts: 0` sample would look brand new to the screen when it reconnects. Set `NTP_SERVER` to the Pi's IP (the Pi can serve NTP) so `ts` is always real.

## Also worth doing (not blocking)

- **Calibrate the soil probe.** `DRY_RAW` (333) and `WET_RAW` (700) in `SoilSens.h` are marked "calibrate!". The app's ranges (for example 15 to 60 %) only mean something once these match the real pot: dry air reads 0 %, a glass of water reads 100 %.
- You already omit a metric when its sensor has no valid reading. Keep that: the screen shows the sensor as not ready and marks it failed if it never reports.
