#pragma once
/*
 * Fake versions of the sensor libraries. The test sets the `Fake` values to make a sensor
 * healthy, silent, disconnected, or return garbage, exactly like real hardware can.
 */
#include <Arduino.h>

/* ---- DHT11 ---- */
#define DHT11 11
#define DHT22 22
struct FakeDht { static float humidity, temperature; };
class DHT {
 public:
  DHT(uint8_t, uint8_t) {}
  void begin() {}
  float readHumidity() { return FakeDht::humidity; }       /* NAN = failed read */
  float readTemperature() { return FakeDht::temperature; }
};

/* ---- I2C bus ---- */
struct TwoWire { void begin() {} };
extern TwoWire Wire;

/* ---- SEN63C air sensor ---- */
struct FakeAir {
  static int16_t startError;  /* nonzero = begin() fails */
  static int16_t readError;   /* nonzero = a read fails (sensor silent or unplugged) */
  static float pm1, pm25, pm4, pm10, humidity, temperature;
  static int16_t co2;
};
class SensirionI2cSen63c {
 public:
  void begin(TwoWire &, uint8_t) {}
  int16_t deviceReset() { return 0; }
  int16_t startContinuousMeasurement() { return FakeAir::startError; }
  int16_t readMeasuredValues(float &pm1, float &pm25, float &pm4, float &pm10, float &hum, float &temp, int16_t &co2) {
    if (FakeAir::readError != 0) return FakeAir::readError;
    pm1 = FakeAir::pm1; pm25 = FakeAir::pm25; pm4 = FakeAir::pm4; pm10 = FakeAir::pm10;
    hum = FakeAir::humidity; temp = FakeAir::temperature; co2 = FakeAir::co2;
    return 0;
  }
};

/* ---- Stemma soil probe (seesaw) ---- */
struct FakeSoil {
  static bool present;        /* false = not on the I2C bus (unplugged) */
  static uint16_t raw;        /* 65535 = failed read */
  static float temperature;
  static int beginCalls;
};
class Adafruit_seesaw {
 public:
  bool begin(uint8_t) { FakeSoil::beginCalls++; return FakeSoil::present; }
  float getTemp() { return FakeSoil::present ? FakeSoil::temperature : NAN; }
  uint16_t touchRead(uint8_t) { return FakeSoil::present ? FakeSoil::raw : 65535; }
};
