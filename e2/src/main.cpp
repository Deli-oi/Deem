/*
 * SEN63C Air Quality Sensor + ESP32 Access Point Web Dashboard + SSD1306 OLED
 *
 * Creates a WiFi access point on the ESP32. Connect to it and visit
 * http://192.168.4.1 to see live CO2 / Temp / RH (large) and PM values
 * (smaller) below.
 *
 * Also drives a 128x64 SSD1306 I2C OLED, sharing the same I2C bus as the
 * SEN63C sensor. Temperature and Humidity are shown boldly, filling the
 * screen. CO2 and PM values are available on the web dashboard only.
 */
#include <Arduino.h>
#include <SensirionI2cSen63c.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// make sure that we use the proper definition of NO_ERROR
#ifdef NO_ERROR
#undef NO_ERROR
#endif
#define NO_ERROR 0

// ---- WiFi Access Point settings ----
const char* AP_SSID = "SEN63C-Monitor";
const char* AP_PASSWORD = "airquality"; // must be 8+ characters, or "" for open network

// ---- OLED settings ----
#define OLED_WIDTH   128
#define OLED_HEIGHT  64
#define OLED_ADDR    0x3C   // common default; some boards use 0x3D
#define OLED_RESET   -1     // no dedicated reset pin (shared with ESP32 reset)

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
bool g_displayOk = false;

SensirionI2cSen63c sensor;
WebServer server(80);

static char errorMessage[64];
static int16_t error;

// Latest readings, shared between loop() and the web handler
volatile float g_pm1p0 = 0.0;
volatile float g_pm2p5 = 0.0;
volatile float g_pm4p0 = 0.0;
volatile float g_pm10p0 = 0.0;
volatile float g_humidity = 0.0;
volatile float g_temperature = 0.0;
volatile int16_t g_co2 = 0;
volatile bool g_haveReading = false;

void handleRoot() {
    char numBuf[16];

    String page;
    page.reserve(4096); // pre-allocate to avoid repeated reallocation

    page += F("<!DOCTYPE html><html><head>"
               "<meta charset='UTF-8'>"
               "<meta name='viewport' content='width=device-width, initial-scale=1'>"
               "<meta http-equiv='refresh' content='3'>"
               "<title>Air Quality Monitor</title>"
               "<style>"
               "body{background:#0f1115;color:#f0f0f0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;"
               "display:flex;flex-direction:column;align-items:center;justify-content:center;"
               "min-height:100vh;margin:0;padding:24px;box-sizing:border-box;}"
               "h1{font-size:1.1rem;font-weight:500;color:#9aa0aa;letter-spacing:.05em;"
               "text-transform:uppercase;margin-bottom:32px;}"
               ".main-readings{display:flex;gap:48px;flex-wrap:wrap;justify-content:center;margin-bottom:40px;}"
               ".reading{text-align:center;}"
               ".reading .value{font-size:4.5rem;font-weight:700;line-height:1;}"
               ".reading .unit{font-size:1.5rem;font-weight:400;color:#9aa0aa;margin-left:6px;}"
               ".reading .label{font-size:1rem;color:#9aa0aa;margin-top:8px;"
               "text-transform:uppercase;letter-spacing:.05em;}"
               ".co2 .value{color:#ff6b6b;} .temp .value{color:#4dabf7;} .rh .value{color:#63e6be;}"
               ".pm-readings{display:flex;gap:32px;flex-wrap:wrap;justify-content:center;padding-top:24px;"
               "border-top:1px solid #2a2d35;width:100%;max-width:700px;}"
               ".pm-reading{text-align:center;}"
               ".pm-reading .value{font-size:1.5rem;font-weight:600;color:#d0d3d9;}"
               ".pm-reading .unit{font-size:0.85rem;color:#6c7280;}"
               ".pm-reading .label{font-size:0.75rem;color:#6c7280;margin-top:4px;"
               "text-transform:uppercase;letter-spacing:.05em;}"
               ".status{margin-top:32px;font-size:0.75rem;color:#4a4e58;}"
               "</style></head><body>"
               "<h1>Air Quality Monitor</h1>"
               "<div class='main-readings'>");

    // CO2
    snprintf(numBuf, sizeof(numBuf), "%d", g_co2);
    page += F("<div class='reading co2'><div class='value'>");
    page += numBuf;
    page += F("<span class='unit'>ppm</span></div><div class='label'>CO2</div></div>");

    // Temperature
    snprintf(numBuf, sizeof(numBuf), "%.1f", g_temperature);
    page += F("<div class='reading temp'><div class='value'>");
    page += numBuf;
    page += F("<span class='unit'>&deg;C</span></div><div class='label'>Temperature</div></div>");

    // Humidity
    snprintf(numBuf, sizeof(numBuf), "%.1f", g_humidity);
    page += F("<div class='reading rh'><div class='value'>");
    page += numBuf;
    page += F("<span class='unit'>%</span></div><div class='label'>Humidity</div></div>");

    page += F("</div><div class='pm-readings'>");

    // PM1.0
    snprintf(numBuf, sizeof(numBuf), "%.1f", g_pm1p0);
    page += F("<div class='pm-reading'><div class='value'>");
    page += numBuf;
    page += F("</div><div class='unit'>&micro;g/m&sup3;</div><div class='label'>PM1.0</div></div>");

    // PM2.5
    snprintf(numBuf, sizeof(numBuf), "%.1f", g_pm2p5);
    page += F("<div class='pm-reading'><div class='value'>");
    page += numBuf;
    page += F("</div><div class='unit'>&micro;g/m&sup3;</div><div class='label'>PM2.5</div></div>");

    // PM4.0
    snprintf(numBuf, sizeof(numBuf), "%.1f", g_pm4p0);
    page += F("<div class='pm-reading'><div class='value'>");
    page += numBuf;
    page += F("</div><div class='unit'>&micro;g/m&sup3;</div><div class='label'>PM4.0</div></div>");

    // PM10.0
    snprintf(numBuf, sizeof(numBuf), "%.1f", g_pm10p0);
    page += F("<div class='pm-reading'><div class='value'>");
    page += numBuf;
    page += F("</div><div class='unit'>&micro;g/m&sup3;</div><div class='label'>PM10.0</div></div>");

    page += F("</div><div class='status'>");
    page += g_haveReading ? F("Live") : F("Waiting for first reading...");
    page += F(" &middot; auto-refreshes every 3s</div></body></html>");

    server.send(200, "text/html", page);
}

// ---- OLED rendering ----
// Layout (128x64):
//   Top half:    big Temp value (size 4) with small "C" unit
//   Bottom half: big RH value (size 4) with small "%" unit
void updateDisplay() {
    if (!g_displayOk) {
        return;
    }

    char buf[16];
    display.clearDisplay();

    // --- Temperature (bold/large), top ---
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print(F("TEMP"));

    display.setTextSize(2);
    display.setCursor(0, 10);
    snprintf(buf, sizeof(buf), "%.1f", g_temperature);
    display.print(buf);
    display.setTextSize(1);
    display.print(F("C"));

    // --- Humidity (bold/large), bottom ---
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

void setup() {

    Serial.begin(115200);
    while (!Serial) {
        delay(100);
    }
    Wire.begin();

    // ---- Init OLED first (shares the I2C bus) ----
    if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
        Serial.println(F("SSD1306 allocation failed / not found at address 0x3C"));
        g_displayOk = false;
    } else {
        g_displayOk = true;
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 24);
        display.println(F("Air Quality Monitor"));
        display.setCursor(0, 36);
        display.println(F("Starting sensor..."));
        display.display();
    }

    sensor.begin(Wire, SEN63C_I2C_ADDR_6B);

    error = sensor.deviceReset();
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute deviceReset(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
    }
    delay(1200);

    int8_t serialNumber[32] = {0};
    error = sensor.getSerialNumber(serialNumber, 32);
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute getSerialNumber(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
    } else {
        Serial.print("Serial Number: ");
        Serial.println((const char*)serialNumber);
    }

    error = sensor.startContinuousMeasurement();
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute startContinuousMeasurement(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
    }
    delay(1100);

    // ---- Start WiFi Access Point ----
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    IPAddress apIP = WiFi.softAPIP();
    Serial.println();
    Serial.print("Access Point started. SSID: ");
    Serial.println(AP_SSID);
    Serial.print("Connect and browse to: http://");
    Serial.println(apIP);

    server.on("/", handleRoot);
    server.begin();
    Serial.println("Web server started.");

    // Show initial (empty) reading layout on OLED
    updateDisplay();
}

void loop() {

    server.handleClient();

    static unsigned long lastRead = 0;
    unsigned long now = millis();
    if (now - lastRead < 1000) {
        return;
    }
    lastRead = now;

    float massConcentrationPm1p0 = 0.0;
    float massConcentrationPm2p5 = 0.0;
    float massConcentrationPm4p0 = 0.0;
    float massConcentrationPm10p0 = 0.0;
    float humidity = 0.0;
    float temperature = 0.0;
    int16_t co2 = 0;

    error = sensor.readMeasuredValues(
        massConcentrationPm1p0, massConcentrationPm2p5, massConcentrationPm4p0,
        massConcentrationPm10p0, humidity, temperature, co2);
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute readMeasuredValues(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
        return;
    }

    g_pm1p0 = massConcentrationPm1p0;
    g_pm2p5 = massConcentrationPm2p5;
    g_pm4p0 = massConcentrationPm4p0;
    g_pm10p0 = massConcentrationPm10p0;
    g_humidity = humidity;
    g_temperature = temperature;
    g_co2 = co2;
    g_haveReading = true;

    Serial.print("CO2: "); Serial.print(co2);
    Serial.print(" ppm  Temp: "); Serial.print(temperature);
    Serial.print(" C  RH: "); Serial.print(humidity);
    Serial.println(" %");

    updateDisplay();
}