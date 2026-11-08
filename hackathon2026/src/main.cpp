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
static bool airReadingValid = false;
static bool soilReadingValid = false;

void read_sensors(Sample &sample) {
  if (dht.isAvailable()) {
    sample.m[M_TEMP_C] = dht.getTemperature();
    sample.m[M_RH_PCT] = dht.getHumidity();
  }

  if (airReadingValid) {
    sample.m[M_CO2_PPM] = static_cast<float>(air.getCO2());
    sample.m[M_PM1_0] = air.getPM1();
    sample.m[M_PM2_5] = air.getPM25();
    sample.m[M_PM4_0] = air.getPM4();
    sample.m[M_PM10_0] = air.getPM10();
  }

  if (soilReadingValid) {
    sample.m[M_SOIL_MOISTURE] = static_cast<float>(soil.getMoisturePercent());
    sample.m[M_SOIL_TEMP_C] = soil.getTemperature();
  }
}

void setup() {
  Serial.begin(115200);
  link_begin();

  Serial.println(dht.begin() ? "DHT sensor initialized" : "DHT sensor failed");
  Serial.println(air.begin() ? "Air sensor initialized" : "Air sensor failed");
  Serial.println(soil.begin() ? "Soil sensor initialized" : "Soil sensor failed");

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
    airReadingValid = true;
  }
  if (soil.update()) {
    soilReadingValid = true;
  }

  if (sample_due()) {
    Sample sample = sample_take();
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
