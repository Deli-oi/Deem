/*
 * Deem pot node — SEN63C air-quality sensor + SSD1306 OLED, reporting over MQTT.
 *
 * This board is one pot's controller (see docs/mqtt_contract.md). It joins the
 * Pi's WiFi network as a *client*, resolves the Pi's Mosquitto broker, and:
 *   - publishes all of the pot's sensor readings to deem/<device_id>/telemetry
 *   - sets a retained Last Will on deem/<device_id>/status (online/offline)
 *   - subscribes to deem/<device_id>/cmd and acks on deem/<device_id>/cmd/ack
 *
 * The SEN63C read loop and the OLED temp/RH display are unchanged from the old
 * AP/web-dashboard firmware; only the "how it talks to the outside world" layer
 * was swapped from a softAP web server to an MQTT client.
 *
 * WiFi/broker config lives in secrets.h (copy secrets.example.h -> secrets.h).
 */
#include <Arduino.h>
#include <SensirionI2cSen63c.h>
#include <Wire.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// make sure that we use the proper definition of NO_ERROR
#ifdef NO_ERROR
#undef NO_ERROR
#endif
#define NO_ERROR 0

// ---- Config (override in secrets.h) ----
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID "CHANGE_ME"           // your iPhone hotspot name
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "CHANGE_ME"           // your hotspot password
#endif
#ifndef DEVICE_ID
#define DEVICE_ID "esp32-pot-01"        // unique per pot: esp32-pot-<nn>
#endif
#ifndef MQTT_MDNS_HOST
#define MQTT_MDNS_HOST "connorlamora"   // resolves connorlamora.local via mDNS
#endif
#ifndef MQTT_FALLBACK_IP
#define MQTT_FALLBACK_IP "172.20.10.5"  // used if mDNS lookup fails (hotspot DHCP)
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#ifndef RELAY_PIN
#define RELAY_PIN 26                     // 5V relay module control pin (channel 1)
#endif
#ifndef RELAY_ACTIVE_HIGH
#define RELAY_ACTIVE_HIGH 1              // set 0 if your relay module is active-low
#endif

static const char* FW_VERSION = "0.2.0";

// ---- OLED settings ----
#define OLED_WIDTH   128
#define OLED_HEIGHT  64
#define OLED_ADDR    0x3C   // common default; some boards use 0x3D
#define OLED_RESET   -1     // no dedicated reset pin (shared with ESP32 reset)

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
bool g_displayOk = false;

SensirionI2cSen63c sensor;
static char errorMessage[64];
static int16_t error;

// ---- MQTT ----
WiFiClient   net;
PubSubClient mqtt(net);
String topicTelemetry = String("deem/") + DEVICE_ID + "/telemetry";
String topicStatus    = String("deem/") + DEVICE_ID + "/status";
String topicCmd       = String("deem/") + DEVICE_ID + "/cmd";
String topicAck       = String("deem/") + DEVICE_ID + "/cmd/ack";

// ---- Latest readings ----
float g_pm1p0 = 0.0, g_pm2p5 = 0.0, g_pm4p0 = 0.0, g_pm10p0 = 0.0;
float g_humidity = 0.0, g_temperature = 0.0;
int16_t g_co2 = 0;
bool  g_haveReading = false;

// ---- Runtime state driven by commands ----
unsigned long g_intervalMs    = 5000;   // telemetry publish interval (set_interval)
bool          g_sampleNow     = false;  // sample_now requested
bool          g_relayOn       = false;  // relay channel 1 state
unsigned long g_identifyUntil = 0;      // identify: flash the OLED until this millis

static inline void relayWrite(bool on) {
#if RELAY_ACTIVE_HIGH
    digitalWrite(RELAY_PIN, on ? HIGH : LOW);
#else
    digitalWrite(RELAY_PIN, on ? LOW : HIGH);
#endif
}

// ---- OLED rendering (unchanged layout: big TEMP / big RH) ----
void updateDisplay() {
    if (!g_displayOk) return;
    char buf[16];
    display.clearDisplay();

    if (g_identifyUntil && (long)(millis() - g_identifyUntil) < 0) {
        display.setTextSize(2);
        display.setCursor(0, 24);
        display.print(F("IDENTIFY"));
        display.display();
        return;
    }

    // Temperature (top)
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print(F("TEMP"));
    // small connection indicator, top-right
    display.setCursor(104, 0);
    display.print(mqtt.connected() ? F("MQTT") : (WiFi.status() == WL_CONNECTED ? F("wifi") : F("----")));

    display.setTextSize(2);
    display.setCursor(0, 10);
    snprintf(buf, sizeof(buf), "%.1f", g_temperature);
    display.print(buf);
    display.setTextSize(1);
    display.print(F("C"));

    // Humidity (bottom)
    display.setTextSize(1);
    display.setCursor(0, 33);
    display.print(F("RH"));
    display.setTextSize(2);
    display.setCursor(0, 46);
    snprintf(buf, sizeof(buf), "%.1f", g_humidity);
    display.print(buf);
    display.setTextSize(1);
    display.print(F("%"));

    display.display();
}

// ---- MQTT helpers ----
void publishAck(const char* cmdId, bool ok, const String& detail) {
    JsonDocument doc;
    doc["cmd_id"] = cmdId;
    doc["ok"]     = ok;
    if (detail.length()) doc["detail"] = detail;
    char buf[160];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    mqtt.publish(topicAck.c_str(), (const uint8_t*)buf, n, false);
}

void publishTelemetry() {
    if (!mqtt.connected()) return;
    JsonDocument doc;
    doc["device_id"] = DEVICE_ID;
    doc["ts"]        = 0;              // no RTC; the Pi stamps received_ts
    doc["fw"]        = FW_VERSION;
    JsonObject m = doc["metrics"].to<JsonObject>();
    if (g_haveReading) {
        m["co2_ppm"] = g_co2;
        m["temp_c"]  = g_temperature;
        m["rh_pct"]  = g_humidity;
        m["pm1_0"]   = g_pm1p0;
        m["pm2_5"]   = g_pm2p5;
        m["pm4_0"]   = g_pm4p0;
        m["pm10_0"]  = g_pm10p0;
    }
    // NOTE: wire the Stemma soil sensor here (soil_moisture / soil_temp_c) per
    // docs/mqtt_contract.md when it is attached to this pot's board.

    char buf[384];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    mqtt.publish(topicTelemetry.c_str(), (const uint8_t*)buf, n, false);
}

void onCommand(char* topic, byte* payload, unsigned int len) {
    JsonDocument doc;
    if (deserializeJson(doc, payload, len)) return;   // ignore malformed JSON

    const char* cmdId  = doc["cmd_id"] | "";
    const char* action = doc["action"] | "";
    bool ok = false;
    String detail;

    if (!strcmp(action, "set_relay")) {
        int  ch = doc["params"]["channel"] | -1;
        bool on = !strcmp(doc["params"]["state"] | "off", "on");
        if (ch == 1) {
            relayWrite(on);
            g_relayOn = on;
            ok = true;
            detail = String("relay 1 ") + (on ? "on" : "off");
        } else {
            detail = "unknown channel";
        }
    } else if (!strcmp(action, "set_interval")) {
        int s = doc["params"]["seconds"] | 0;
        if (s >= 1 && s <= 3600) {
            g_intervalMs = (unsigned long)s * 1000UL;
            ok = true;
            detail = String("interval ") + s + "s";
        } else {
            detail = "seconds out of range";
        }
    } else if (!strcmp(action, "sample_now")) {
        g_sampleNow = true;
        ok = true;
        detail = "sampling";
    } else if (!strcmp(action, "identify")) {
        g_identifyUntil = millis() + 3000;
        ok = true;
        detail = "identify";
    } else if (!strcmp(action, "reboot")) {
        publishAck(cmdId, true, "rebooting");
        delay(200);
        ESP.restart();
        return;
    } else {
        detail = "unknown action";
    }
    publishAck(cmdId, ok, detail);
}

void resolveBroker() {
    IPAddress ip;
    if (MDNS.begin(DEVICE_ID)) {
        ip = MDNS.queryHost(MQTT_MDNS_HOST);   // -> connorlamora.local
    }
    if (ip == IPAddress(0, 0, 0, 0)) {
        ip.fromString(MQTT_FALLBACK_IP);       // hotspot fallback
        Serial.print("mDNS lookup failed, using fallback IP ");
    } else {
        Serial.print("broker resolved via mDNS: ");
    }
    Serial.println(ip);
    mqtt.setServer(ip, MQTT_PORT);
}

void connectWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.print("Connecting to WiFi \"" WIFI_SSID "\"");
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 30000) {
        delay(250);
        Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("WiFi OK, IP: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("WiFi connect timed out; will keep retrying in loop().");
    }
}

void mqttReconnect() {
    if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
        if (WiFi.status() != WL_CONNECTED) return;
        resolveBroker();
    }
    if (mqtt.connected()) return;

    // Last Will: broker marks us offline (retained) if we drop.
    const char* willMsg = "{\"state\":\"offline\"}";
    Serial.print("MQTT connect as " DEVICE_ID " ... ");
    if (mqtt.connect(DEVICE_ID,
                     /*user*/ nullptr, /*pass*/ nullptr,
                     topicStatus.c_str(), /*willQoS*/ 1, /*willRetain*/ true,
                     willMsg)) {
        Serial.println("connected");
        String online = String("{\"state\":\"online\",\"fw\":\"") + FW_VERSION + "\"}";
        mqtt.publish(topicStatus.c_str(), online.c_str(), true);   // retained
        mqtt.subscribe(topicCmd.c_str(), 1);
    } else {
        Serial.print("failed, rc=");
        Serial.println(mqtt.state());
        delay(2000);
    }
}

void setup() {
    Serial.begin(115200);
    delay(200);
    Wire.begin();

    pinMode(RELAY_PIN, OUTPUT);
    relayWrite(false);

    // ---- Init OLED first (shares the I2C bus) ----
    if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
        Serial.println(F("SSD1306 not found at 0x3C"));
        g_displayOk = false;
    } else {
        g_displayOk = true;
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 24);
        display.println(F("Deem pot node"));
        display.setCursor(0, 36);
        display.println(F("Connecting WiFi..."));
        display.display();
    }

    // ---- SEN63C ----
    sensor.begin(Wire, SEN63C_I2C_ADDR_6B);
    error = sensor.deviceReset();
    if (error != NO_ERROR) {
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.print("deviceReset(): "); Serial.println(errorMessage);
    }
    delay(1200);
    error = sensor.startContinuousMeasurement();
    if (error != NO_ERROR) {
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.print("startContinuousMeasurement(): "); Serial.println(errorMessage);
    }
    delay(1100);

    // ---- Network ----
    connectWiFi();
    resolveBroker();
    mqtt.setBufferSize(512);          // telemetry JSON exceeds the 256B default
    mqtt.setCallback(onCommand);

    updateDisplay();
}

void readSensor() {
    float pm1 = 0, pm25 = 0, pm4 = 0, pm10 = 0, rh = 0, t = 0;
    int16_t co2 = 0;
    error = sensor.readMeasuredValues(pm1, pm25, pm4, pm10, rh, t, co2);
    if (error != NO_ERROR) {
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.print("readMeasuredValues(): "); Serial.println(errorMessage);
        return;
    }
    g_pm1p0 = pm1; g_pm2p5 = pm25; g_pm4p0 = pm4; g_pm10p0 = pm10;
    g_humidity = rh; g_temperature = t; g_co2 = co2;
    g_haveReading = true;
}

void loop() {
    if (!mqtt.connected()) {
        mqttReconnect();
    }
    mqtt.loop();                      // services incoming commands + keepalive

    static unsigned long lastRead = 0;
    static unsigned long lastPub  = 0;
    unsigned long now = millis();

    // Read the sensor ~1 Hz so the OLED stays live regardless of publish rate.
    if (now - lastRead >= 1000) {
        lastRead = now;
        readSensor();
        updateDisplay();
    }

    // Publish on the configured interval, or immediately on sample_now.
    if (g_sampleNow || (now - lastPub >= g_intervalMs)) {
        lastPub = now;
        g_sampleNow = false;
        publishTelemetry();
    }
}
