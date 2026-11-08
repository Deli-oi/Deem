# ESP32 ↔ Pi Integration Guide (firmware side)

For the teammate working in `e2/`. This explains how to make the ESP32 talk to
the Pi controller. The wire format is defined in `docs/mqtt_contract.md` — read
that first; this doc is the hands-on how-to.

## What changes from the current firmware
The existing `e2/src/main.cpp` runs the ESP32 as its **own WiFi access point**
with an onboard web dashboard. For the central-controller model we flip it:

| Current | New |
|---------|-----|
| ESP32 is a WiFi **AP** (`WiFi.softAP`) | ESP32 is a WiFi **client** (`WiFi.begin`) that joins the Pi's network |
| Serves HTML at `192.168.4.1` | Publishes JSON telemetry over MQTT |
| No way to receive commands | Subscribes for commands (relay control, etc.) |

The sensor-reading code stays — only the "how it talks to the outside world"
layer changes. The product **2.8" TFT lives on the Pi** (Chromium kiosk); any
SSD1306 OLED on the ESP32 is optional debug only, not the user-facing UI.

**MVP scope:** one ESP32 for the one demo pot (`esp32-pot-01`). A second DevKit
on hand is spare / unused.

## Network assumption
The Pi and the ESP32 share a LAN. Simplest for a greenhouse: run the ESP32 as a
client of a WiFi network the Pi is also on (home router, or a hotspot on the
Pi). The Pi's Mosquitto broker is reachable at the Pi's LAN IP, port `1883`.

Set these in firmware (or a `secrets.h`):
```cpp
#define WIFI_SSID     "your-greenhouse-ssid"
#define WIFI_PASS     "your-wifi-pass"
#define MQTT_HOST     "192.168.1.50"   // the Pi's LAN IP
#define MQTT_PORT     1883
#define DEVICE_ID     "esp32-pot-01"   // unique per pot (MVP: one board)
```

## Library
Add an MQTT client to `e2/platformio.ini`:
```ini
lib_deps =
    ; ...existing deps...
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^7.0
```

## Minimal sketch (telemetry + commands)
This is a reference skeleton — merge it into your existing `main.cpp`, reusing
your sensor reads for the `metrics`.

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

static const char* DEVICE_ID = "esp32-aqi-01";
static const char* MQTT_HOST = "192.168.1.50";
static const uint16_t MQTT_PORT = 1883;

WiFiClient   net;
PubSubClient mqtt(net);

String topicTelemetry = String("deem/") + DEVICE_ID + "/telemetry";
String topicStatus    = String("deem/") + DEVICE_ID + "/status";
String topicCmd       = String("deem/") + DEVICE_ID + "/cmd";
String topicAck       = String("deem/") + DEVICE_ID + "/cmd/ack";

void onCommand(char* topic, byte* payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) return;        // ignore bad JSON

  const char* cmdId  = doc["cmd_id"] | "";
  const char* action = doc["action"] | "";

  bool ok = false;
  if (strcmp(action, "set_relay") == 0) {
    int  channel = doc["params"]["channel"] | -1;
    bool on      = strcmp(doc["params"]["state"] | "off", "on") == 0;
    // digitalWrite(relayPin(channel), on ? HIGH : LOW);
    ok = (channel >= 0);
  }
  // ... handle set_interval / identify / reboot ...

  JsonDocument ack;
  ack["cmd_id"] = cmdId;
  ack["ok"]     = ok;
  char buf[128];
  size_t n = serializeJson(ack, buf);
  mqtt.publish(topicAck.c_str(), (const uint8_t*)buf, n, false);
}

void mqttReconnect() {
  while (!mqtt.connected()) {
    // Last Will: broker marks us offline (retained) if we drop.
    const char* willMsg = "{\"state\":\"offline\"}";
    if (mqtt.connect(DEVICE_ID,
                     /*user*/ nullptr, /*pass*/ nullptr,
                     topicStatus.c_str(), /*willQoS*/ 1, /*willRetain*/ true,
                     willMsg)) {
      mqtt.publish(topicStatus.c_str(), "{\"state\":\"online\"}", true); // retained
      mqtt.subscribe(topicCmd.c_str(), 1);
    } else {
      delay(2000);
    }
  }
}

void publishTelemetry(float co2, float tempC, float rh,
                      float pm1, float pm25, float pm4, float pm10) {
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["ts"]        = 0;              // no RTC on the ESP32; Pi stamps arrival time
  doc["fw"]        = "0.1.0";
  JsonObject m = doc["metrics"].to<JsonObject>();
  m["co2_ppm"] = co2;  m["temp_c"] = tempC; m["rh_pct"] = rh;
  m["pm1_0"]   = pm1;  m["pm2_5"]  = pm25;  m["pm4_0"]  = pm4;  m["pm10_0"] = pm10;

  char buf[256];
  size_t n = serializeJson(doc, buf);
  mqtt.publish(topicTelemetry.c_str(), (const uint8_t*)buf, n, false);
}

void setup() {
  WiFi.begin("your-greenhouse-ssid", "your-wifi-pass");
  while (WiFi.status() != WL_CONNECTED) delay(250);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onCommand);
  mqtt.setBufferSize(512);          // telemetry JSON can exceed the 256B default
  // ... your existing sensor + OLED setup ...
}

void loop() {
  if (!mqtt.connected()) mqttReconnect();
  mqtt.loop();                      // services incoming commands

  static unsigned long last = 0;
  if (millis() - last > 5000) {     // publish every 5s
    last = millis();
    // read your sensors here, then:
    // publishTelemetry(co2, tempC, rh, pm1, pm25, pm4, pm10);
  }
}
```

## Testing against the Pi
On the Pi (or any machine with `mosquitto-clients`):

```bash
# Watch everything the ESP32 publishes:
mosquitto_sub -h <pi-ip> -t 'deem/#' -v

# Pretend to be the Pi and send a command to the device:
mosquitto_pub -h <pi-ip> -t 'deem/esp32-aqi-01/cmd' \
  -m '{"cmd_id":"t1","action":"set_relay","params":{"channel":1,"state":"on"}}'
```

You can also use the controller's built-in command sender (see `pi/README.md`):
```bash
python -m deem_controller --config config.yaml send \
  --device esp32-aqi-01 --action set_relay --params '{"channel":1,"state":"on"}'
```

## Checklist for a new ESP32 node
- [ ] Give it a unique `DEVICE_ID`.
- [ ] Join the shared WiFi (client mode, not AP).
- [ ] Set Last Will on `deem/<id>/status` = `{"state":"offline"}` (retained).
- [ ] Publish `{"state":"online"}` (retained) after connecting.
- [ ] Publish telemetry to `deem/<id>/telemetry` with a `metrics` object.
- [ ] Subscribe to `deem/<id>/cmd` and ack on `deem/<id>/cmd/ack`.
- [ ] Bump `mqtt.setBufferSize(...)` if your JSON grows.
