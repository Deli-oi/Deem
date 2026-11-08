// Runs the real firmware loop (main.cpp) against fake sensors and checks what it would publish.
#include <Arduino.h>
#include "hardware.h"

unsigned long g_millis = 5000;
SerialStub Serial;
TwoWire Wire;
float FakeDht::humidity = 45, FakeDht::temperature = 22;
int16_t FakeAir::startError = 0, FakeAir::readError = 0, FakeAir::co2 = 650;
float FakeAir::pm1 = 1, FakeAir::pm25 = 2, FakeAir::pm4 = 3, FakeAir::pm10 = 4, FakeAir::humidity = 45, FakeAir::temperature = 22;
bool FakeSoil::present = true;
uint16_t FakeSoil::raw = 500;
float FakeSoil::temperature = 21;
int FakeSoil::beginCalls = 0;

#include "main.cpp"

static int failures = 0;
#define CHECK(c) do { if (!(c)) { printf("  FAIL line %d: %s\n", __LINE__, #c); failures++; } } while (0)

static void run_seconds(int s) { for (int i = 0; i < s; i++) { g_millis += 1000; loop(); } }
static Sample last_sample() { Sample s =  batch.rows[(batch.head + batch.count - 1) % BATCH_CAP]; return s; }
static bool has(const Sample &s, Metric m) { return std::isfinite(s.m[m]); }

int main() {
  printf("healthy hardware publishes everything\n");
  setup();
  run_seconds(2);
  printf("soil moisture calibration maps dry to wet and clamps endpoints\n");
  FakeSoil::raw = 550;
  run_seconds(1);
  CHECK(soil.getMoisturePercent() == 0);
  FakeSoil::raw = 570;
  run_seconds(1);
  int dryPercent = soil.getMoisturePercent();
  CHECK(dryPercent == 4);
  FakeSoil::raw = 915;
  run_seconds(1);
  int healthyPercent = soil.getMoisturePercent();
  CHECK(healthyPercent == 84 && healthyPercent > dryPercent);
  FakeSoil::raw = 935;
  run_seconds(1);
  CHECK(soil.getMoisturePercent() == 89);
  FakeSoil::raw = 980;
  run_seconds(1);
  CHECK(soil.getMoisturePercent() == 100);
  FakeSoil::raw = 500;
  run_seconds(1);
  CHECK(soil.getMoisturePercent() == 0);
  FakeSoil::raw = 1000;
  run_seconds(1);
  CHECK(soil.getMoisturePercent() == 100);
  FakeSoil::raw = 500;
  run_seconds(1);
  run_seconds(600);
  Sample s = last_sample();
  for (int m = 0; m < METRIC_COUNT; m++) CHECK(has(s, (Metric)m));
  CHECK(s.m[M_CO2_PPM] == 650);

  printf("air sensor unplugged: stale CO2/PM must disappear, soil and DHT keep going\n");
  FakeAir::readError = -1;
  run_seconds(600);
  s = last_sample();
  CHECK(!has(s, M_CO2_PPM) && !has(s, M_PM2_5));
  CHECK(has(s, M_TEMP_C) && has(s, M_SOIL_MOISTURE));

  printf("air sensor back: values return\n");
  FakeAir::readError = 0;
  run_seconds(600);
  CHECK(has(last_sample(), M_CO2_PPM));

  printf("CO2 warm-up value (0xFFFF) is never published as a number\n");
  FakeAir::co2 = (int16_t)0xFFFF;
  run_seconds(600);
  s = last_sample();
  CHECK(!has(s, M_CO2_PPM));
  CHECK(has(s, M_PM2_5));
  FakeAir::co2 = 700;

  printf("soil probe unplugged: no stale soil reading\n");
  FakeSoil::present = false;
  run_seconds(600);
  s = last_sample();
  CHECK(!has(s, M_SOIL_MOISTURE) && !has(s, M_SOIL_TEMP_C));
  CHECK(has(s, M_CO2_PPM));

  printf("soil probe plugged back in: it recovers without a reboot\n");
  FakeSoil::present = true;
  run_seconds(600);
  CHECK(has(last_sample(), M_SOIL_MOISTURE));

  /* From here on the two sensors read different values so the test can tell which one was used. */
  FakeDht::temperature = 22.0f; FakeDht::humidity = 45.0f;
  FakeAir::temperature = 23.5f; FakeAir::humidity = 41.0f;

  printf("healthy DHT11 is the source of temperature and humidity\n");
  run_seconds(600);
  s = last_sample();
  CHECK(s.m[M_TEMP_C] == 22.0f && s.m[M_RH_PCT] == 45.0f);

  printf("DHT11 mis-wired (57 C / 95 %% seen on the real pot): the SEN63C values are used instead\n");
  FakeDht::temperature = 57.4f; FakeDht::humidity = 95.0f;
  run_seconds(600);
  s = last_sample();
  CHECK(s.m[M_TEMP_C] == 23.5f && s.m[M_RH_PCT] == 41.0f);

  printf("one impossible DHT11 number is enough to distrust both (temp fine, humidity 95)\n");
  FakeDht::temperature = 22.0f; FakeDht::humidity = 95.0f;
  run_seconds(600);
  s = last_sample();
  CHECK(s.m[M_TEMP_C] == 23.5f && s.m[M_RH_PCT] == 41.0f);

  printf("DHT11 failing (NAN): the SEN63C values are used, not stuck old ones\n");
  FakeDht::temperature = NAN; FakeDht::humidity = NAN;
  run_seconds(600);
  s = last_sample();
  CHECK(s.m[M_TEMP_C] == 23.5f && s.m[M_RH_PCT] == 41.0f);
  CHECK(has(s, M_CO2_PPM));

  printf("DHT11 recovers: it takes over again\n");
  FakeDht::temperature = 21.0f; FakeDht::humidity = 50.0f;
  run_seconds(600);
  s = last_sample();
  CHECK(s.m[M_TEMP_C] == 21.0f && s.m[M_RH_PCT] == 50.0f);

  printf("both sources bad: temperature and humidity are left out, never a wrong number\n");
  FakeDht::temperature = 57.4f; FakeDht::humidity = 95.0f;
  FakeAir::temperature = 90.0f; FakeAir::humidity = 130.0f;
  run_seconds(600);
  s = last_sample();
  CHECK(!has(s, M_TEMP_C) && !has(s, M_RH_PCT));
  CHECK(has(s, M_CO2_PPM) && has(s, M_SOIL_MOISTURE)); /* the rest still flows */

  printf("SEN63C silent: no fallback temperature from a sensor that stopped answering\n");
  FakeAir::temperature = 23.5f; FakeAir::humidity = 41.0f;
  FakeAir::readError = -1;
  run_seconds(600);
  s = last_sample();
  CHECK(!has(s, M_TEMP_C) && !has(s, M_RH_PCT));
  FakeAir::readError = 0;

  printf("dust 'no data' marker (6553.5) and CO2 error markers are never published\n");
  FakeAir::pm1 = 6553.5f; FakeAir::pm25 = 6553.5f; FakeAir::pm4 = 6553.5f; FakeAir::pm10 = 6553.5f;
  FakeAir::co2 = 32767;
  FakeDht::temperature = 22.0f; FakeDht::humidity = 45.0f;
  run_seconds(600);
  s = last_sample();
  CHECK(!has(s, M_PM1_0) && !has(s, M_PM2_5) && !has(s, M_PM4_0) && !has(s, M_PM10_0));
  CHECK(!has(s, M_CO2_PPM));
  CHECK(has(s, M_TEMP_C));
  FakeAir::pm1 = 1; FakeAir::pm25 = 2; FakeAir::pm4 = 3; FakeAir::pm10 = 4; FakeAir::co2 = 650;
  run_seconds(600);
  CHECK(has(last_sample(), M_PM2_5) && has(last_sample(), M_CO2_PPM));

  printf("%s\n", failures ? "FAILED" : "ALL PASSED");
  return failures ? 1 : 0;
}
