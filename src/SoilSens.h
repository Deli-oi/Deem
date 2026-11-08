#ifndef SOILSENS_H
#define SOILSENS_H

#include <Arduino.h>
#include <Adafruit_seesaw.h>   // library: "Adafruit seesaw Library"

// SoilSens: Adafruit STEMMA soil sensor (seesaw), on I2C (SDA/SCL), address 0x36.
//
// Usage:
//   SoilSens soil;
//   void setup() { Serial.begin(115200); soil.begin(); }
//   void loop()  { soil.update(); Serial.println(soil.getMoisturePercent()); }

class SoilSens {
public:
    SoilSens() {
        moisture_ = 0;
        temperature_ = NAN;
        available_ = false;
        failedReads_ = 0;
        lastRead_ = 0;
    }

    // Start the sensor. Returns true if it was found on I2C.
    bool begin() {
        available_ = ss_.begin(0x36);
        return available_;
    }

    // Read the sensor. Safe to call every loop(); reads once per second.
    bool update() {
        if (!available_) return false;
        if (millis() - lastRead_ < 1000) return false;
        lastRead_ = millis();

        float t = ss_.getTemp();             // Celsius
        uint16_t m = ss_.touchRead(0);       // capacitive moisture

        if (isnan(t) || m == 65535) {        // 65535 = failed read
            failedReads_++;
            if (failedReads_ >= 5) available_ = false;
            return false;                    // keep the old values
        }

        temperature_ = t;
        moisture_ = m;
        failedReads_ = 0;
        return true;
    }

    // Getters (last good reading)
    uint16_t getMoistureRaw() const { return moisture_; }   // about 200 (dry) to 2000 (wet)
    int getMoisturePercent() const {                         // 0-100 %
        return constrain(map(moisture_, DRY_RAW, WET_RAW, 0, 100), 0, 100);
    }
    float getTemperature() const { return temperature_; }    // Celsius
    bool isAvailable() const { return available_; }

private:
    static const int DRY_RAW = 333;    // raw value in dry air  (calibrate!)
    static const int WET_RAW = 700;   // raw value in water    (calibrate!)

    Adafruit_seesaw ss_;
    uint16_t moisture_;
    float temperature_;
    bool available_;
    uint8_t failedReads_;
    unsigned long lastRead_;
};

#endif // SOILSENS_H