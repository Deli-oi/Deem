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

  printf("DHT11 failing: temp/humidity are left out, not stuck\n");
  FakeDht::temperature = NAN; FakeDht::humidity = NAN;
  run_seconds(600);
  s = last_sample();
  CHECK(!has(s, M_TEMP_C) && !has(s, M_RH_PCT));
  CHECK(has(s, M_CO2_PPM));

  printf("%s\n", failures ? "FAILED" : "ALL PASSED");
  return failures ? 1 : 0;
}
