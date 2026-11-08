#ifndef AIRSENS_H
#define AIRSENS_H

#include <Arduino.h>
#include <Wire.h>
#include <SensirionI2cSen63c.h>   // library: "Sensirion I2C SEN63C"

// AirSens: simple wrapper for the Sensirion SEN63C (PM, CO2, temp, humidity).
// Wiring: SDA -> SDA, SCL -> SCL, 3.3V/5V per datasheet, GND -> GND.
//
// Usage:
//   AirSens air;
//   void setup() { Serial.begin(115200); air.begin(); }
//   void loop()  { air.update(); Serial.println(air.getCO2()); }

class AirSens {
public:
    AirSens() {
        pm1_ = pm25_ = pm4_ = pm10_ = NAN;
        humidity_ = temperature_ = NAN;
        co2_ = 0;
        available_ = false;
        lastRead_ = 0;
    }

    // Start the sensor. Returns true if it started OK.
    bool begin() {
        Wire.begin();                       // uses the board's default SDA/SCL pins
        sensor_.begin(Wire, 0x6B);          // SEN63C I2C address
        sensor_.deviceReset();
        delay(1200);                        // sensor needs time after reset
        int16_t err = sensor_.startContinuousMeasurement();
        available_ = (err == 0);
        if (available_) {
            delay(1000);                    // allow the first measurement to complete
        }
        return available_;
    }

    // Read all values. Call every loop(); it only talks to the sensor once per second.
    bool update() {
        if (!available_) return false;
        if (millis() - lastRead_ < 1000) return false;
        lastRead_ = millis();

        float pm1, pm25, pm4, pm10, hum, temp;
        int16_t co2;
        int16_t err = sensor_.readMeasuredValues(pm1, pm25, pm4, pm10, hum, temp, co2);
        if (err != 0) return false;         // keep the old values

        pm1_ = pm1;
        pm25_ = pm25;
        pm4_ = pm4;
        pm10_ = pm10;
        humidity_ = hum;
        temperature_ = temp;
        co2_ = co2;
        return true;
    }

    // Getters (last good reading)
    float getPM1() const { return pm1_; }               // ug/m3
    float getPM25() const { return pm25_; }             // ug/m3
    float getPM4() const { return pm4_; }               // ug/m3
    float getPM10() const { return pm10_; }             // ug/m3
    float getHumidity() const { return humidity_; }     // % RH
    float getTemperature() const { return temperature_; }  // Celsius
    int16_t getCO2() const { return co2_; }             // ppm
    bool isAvailable() const { return available_; }

private:
    SensirionI2cSen63c sensor_;
    float pm1_, pm25_, pm4_, pm10_;
    float humidity_, temperature_;
    int16_t co2_;
    bool available_;
    unsigned long lastRead_;
};

#endif // AIRSENS_H