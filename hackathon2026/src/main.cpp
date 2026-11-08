#include <Arduino.h>

#include "Airsens.h"
#include "DHT_SENSOR.h"
#include "SoilSens.h"
#include "mqtt_link.h"

static constexpr uint8_t DHT_PIN = 4;

static DHTSensor dht(DHT_PIN, DHT11);
static AirSens air;
static SoilSens soil;
static Batch batch;

/* A reading is only published if it was refreshed recently. Without this, an unplugged air or
 * soil sensor would keep re-publishing its last good value forever and look healthy. */
static constexpr unsigned long FRESH_MS = 60UL * 1000UL;
static bool airEverRead = false, soilEverRead = false;
static unsigned long airReadAt = 0, soilReadAt = 0;
static inline bool fresh(bool ever, unsigned long at) { return ever && (millis() - at) < FRESH_MS; }

/* SEN63C reports 0xFFFF (65535) for CO2 while it is still warming up; real air is ~400-5000 ppm. */
static inline bool co2_plausible(int co2) { return co2 > 0 && co2 <= 10000; }

void read_sensors(Sample &sample) {
  if (dht.isAvailable()) {
    sample.m[M_TEMP_C] = dht.getTemperature();
    sample.m[M_RH_PCT] = dht.getHumidity();
  }

  if (fresh(airEverRead, airReadAt)) {
    if (co2_plausible(air.getCO2())) sample.m[M_CO2_PPM] = static_cast<float>(air.getCO2());
    sample.m[M_PM1_0] = air.getPM1();
    sample.m[M_PM2_5] = air.getPM25();
    sample.m[M_PM4_0] = air.getPM4();
    sample.m[M_PM10_0] = air.getPM10();
  }

  if (fresh(soilEverRead, soilReadAt)) {
    sample.m[M_SOIL_MOISTURE] = static_cast<float>(soil.getMoisturePercent());
    sample.m[M_SOIL_TEMP_C] = soil.getTemperature();
  }
}

void setup() {
  Serial.begin(9600);
  link_begin();

  const bool dhtStarted = dht.begin();
  const bool airStarted = air.begin();
  const bool soilStarted = soil.begin();
  link_set_sensor_status(dhtStarted, airStarted, soilStarted);

  Serial.println(dhtStarted ? "DHT sensor initialized" : "DHT sensor failed");
  Serial.println(airStarted ? "Air sensor initialized" : "Air sensor failed");
  Serial.println(soilStarted ? "Soil sensor initialized" : "Soil sensor failed");

  char line[160];
  int headerLength = sample_csv_header(line, sizeof(line));
  if (headerLength > 0) {
    line[headerLength] = '\0';
    Serial.println(line);
  }
}

void loop() {
  link_loop();

  dht.updateNonblocking();
  if (air.update()) {
    airEverRead = true;
    airReadAt = millis();
  }
  if (soil.update()) {
    soilEverRead = true;
    soilReadAt = millis();
  }

  if (sample_due()) {
    Sample sample = sample_take();
    Serial.printf("soil raw=%u (set DRY_RAW/WET_RAW in SoilSens.h from this)\n", (unsigned)soil.getMoistureRaw());
    batch_push(batch, sample);

    char line[160];
    int lineLength = sample_to_csv(sample, line, sizeof(line));
    if (lineLength > 0) {
      line[lineLength] = '\0';
      Serial.println(line);
    }
  }

  if (batch_ready(batch) && link_connected()) {
    link_flush(batch);
  }
}
