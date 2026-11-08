#ifndef DHT_SENSOR_H
#define DHT_SENSOR_H

#include <Arduino.h>
#include <DHT.h>   // Adafruit "DHT sensor library" (also install Adafruit Unified Sensor)

// DHTSensor: simple wrapper around the Adafruit DHT library.
//
// Usage:
//   DHTSensor dhtSensor(4, DHT22);   // pin, type (DHT11 or DHT22)
//   void setup() { Serial.begin(115200); dhtSensor.begin(); }
//   void loop()  { dhtSensor.updateNonblocking(); Serial.println(dhtSensor.getTemperature()); }
//
// NOTE: do not #define a pin called DHT anywhere in your project
// (use DHT_PIN instead), or it will clash with the library's DHT class.

class DHTSensor {
public:
    // Constructor: runs when you create the object
    DHTSensor(uint8_t pin, uint8_t type = DHT11)
        : dht_(pin, type) {
        temperature_ = NAN;      // NAN = "no reading yet"
        humidity_ = NAN;
        available_ = false;
        failedReads_ = 0;
        lastUpdate_ = 0;
        hasRead_ = false;

        // DHT11 can be read about once per second, DHT22 once per 2 seconds
        if (type == DHT11) {
            minIntervalMs_ = 1000;
        } else {
            minIntervalMs_ = 2000;
        }
    }

    // Start the sensor. Returns true if the first reading worked.
    bool begin() {
        dht_.begin();
        delay(minIntervalMs_);   // give the sensor time to settle
        return update();
    }

    // Read the sensor right now. Returns true if the read worked.
    bool update() {
        float h = dht_.readHumidity();
        float t = dht_.readTemperature();   // Celsius
        lastUpdate_ = millis();
        hasRead_ = true;

        // A failed read gives NAN ("not a number")
        if (isnan(h) || isnan(t)) {
            failedReads_++;
            if (failedReads_ >= 5) {
                available_ = false;   // 5 failures in a row = sensor is down
            }
            return false;             // keep the old values
        }

        humidity_ = h;
        temperature_ = t;
        failedReads_ = 0;
        available_ = true;
        return true;
    }

    // Safe to call every loop(). Only reads when enough time has passed.
    bool updateNonblocking() {
        if (hasRead_ && (millis() - lastUpdate_) < minIntervalMs_) {
            return false;   // too soon, do nothing
        }
        return update();
    }

    // Getters (return the last good reading)
    float getTemperature() const { return temperature_; }                  // Celsius
    float getTemperatureF() const { return temperature_ * 1.8 + 32.0; }    // Fahrenheit
    float getHumidity() const { return humidity_; }                        // % relative humidity

    // Dew point in Celsius (Magnus formula)
    float getDewPoint() const {
        if (!available_) return NAN;
        float a = 17.62;
        float b = 243.12;
        float gamma = (a * temperature_) / (b + temperature_) + log(humidity_ / 100.0);
        return (b * gamma) / (a - gamma);
    }

    // Absolute humidity in mg/m^3, the format the SGP30 wants
    // (use with sgp.setHumidity())
    uint32_t getAbsoluteHumidity() const {
        if (!available_) return 0;
        float grams = 216.7 * ((humidity_ / 100.0) * 6.112 *
                      exp((17.62 * temperature_) / (243.12 + temperature_)) /
                      (273.15 + temperature_));
        return (uint32_t)(grams * 1000.0);
    }

    // Status
    bool isAvailable() const { return available_; }
    uint8_t getFailedReads() const { return failedReads_; }

private:
    DHT dht_;                      // the Adafruit library object

    float temperature_;            // last good temperature (Celsius)
    float humidity_;               // last good humidity (%)
    bool available_;               // true if the sensor is working
    uint8_t failedReads_;          // failed reads in a row
    unsigned long lastUpdate_;     // time of last read (ms)
    unsigned long minIntervalMs_;  // minimum time between reads (ms)
    bool hasRead_;                 // true after the first read attempt
};

#endif // DHT_SENSOR_H