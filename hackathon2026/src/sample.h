#ifndef DEEM_SAMPLE_H
#define DEEM_SAMPLE_H

/*
 * One sensor sample = one pot's readings at one moment, laid out exactly like
 * the "metrics" object in docs/mqtt_contract.md (v1).
 *
 * Usage:
 *   1. Define  void read_sensors(Sample &s)  in main.cpp and fill the metrics
 *      you actually have wired (leave the others alone; they stay NAN and are
 *      left out of the JSON).
 *   2. Call sample_due() every loop(); when it returns true, call sample_take().
 */

#include <Arduino.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h>
#include <cmath>
#include "config.h"

/* Change this one number to scale: 30 -> 60 is a 1 minute sample. */
#ifndef SAMPLE_INTERVAL_S
#define SAMPLE_INTERVAL_S 30
#endif
#define SAMPLE_INTERVAL_MS (SAMPLE_INTERVAL_S * 1000UL)

/* Keep this enum and METRIC_KEYS in the same order. Add new metrics at the end. */
enum Metric : uint8_t {
  M_CO2_PPM, M_TEMP_C, M_RH_PCT,
  M_PM1_0, M_PM2_5, M_PM4_0, M_PM10_0,
  M_SOIL_MOISTURE, M_SOIL_TEMP_C,
  METRIC_COUNT
};

static const char *const METRIC_KEYS[METRIC_COUNT] = {
  "co2_ppm", "temp_c", "rh_pct",
  "pm1_0", "pm2_5", "pm4_0", "pm10_0",
  "soil_moisture", "soil_temp_c"
};

struct Sample {
  uint32_t ts;           /* epoch seconds, or 0 if the clock is not synced */
  float m[METRIC_COUNT]; /* NAN = not measured this cycle */
};

/* Provided by you in main.cpp. */
void read_sensors(Sample &s);

static inline void sample_clear(Sample &s) {
  s.ts = 0;
  for (int i = 0; i < METRIC_COUNT; i++) s.m[i] = NAN;
}

/* Epoch seconds once NTP has synced (anything after Nov 2023), otherwise 0. */
static inline uint32_t sample_epoch() {
  time_t t = time(nullptr);
  return t > 1700000000 ? (uint32_t)t : 0;
}

/* Non-blocking timer: true at boot, then once every SAMPLE_INTERVAL_S. */
static inline bool sample_due() {
  static bool first = true;
  static uint32_t last = 0;
  uint32_t now = millis();
  if (first || (uint32_t)(now - last) >= SAMPLE_INTERVAL_MS) {
    first = false;
    last = now;
    return true;
  }
  return false;
}

static inline Sample sample_take() {
  Sample s;
  sample_clear(s);
  s.ts = sample_epoch();
  read_sensors(s);
  return s;
}

/* Bounds-checked snprintf that appends at out[n]. Returns false if it did not fit. */
static inline bool sample_append(char *out, size_t cap, int &n, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int w = vsnprintf(out + n, cap - (size_t)n, fmt, ap);
  va_end(ap);
  if (w < 0 || (size_t)w >= cap - (size_t)n) return false;
  n += w;
  return true;
}

/*
 * Telemetry payload for deem/<device_id>/telemetry, exactly the contract shape:
 *   {"device_id":"..","ts":N,"fw":"..","metrics":{"temp_c":22.40,...}}
 * Returns the length, or -1 if the buffer is too small or the sample has no
 * readings at all (the contract requires at least one numeric metric).
 * DEVICE_ID and FW_VERSION are written unescaped, so keep them plain ASCII.
 */
static inline int sample_to_json(const Sample &s, char *out, size_t cap) {
  int n = 0;
  if (cap == 0) return -1;
  if (!sample_append(out, cap, n,
        "{\"device_id\":\"%s\",\"ts\":%lu,\"fw\":\"%s\",\"metrics\":{",
        DEVICE_ID, (unsigned long)s.ts, FW_VERSION)) return -1;
  bool any = false;
  for (int i = 0; i < METRIC_COUNT; i++) {
    if (!std::isfinite(s.m[i])) continue;
    if (!sample_append(out, cap, n, "%s\"%s\":%.2f", any ? "," : "", METRIC_KEYS[i], s.m[i])) return -1;
    any = true;
  }
  if (!any) return -1;
  if (!sample_append(out, cap, n, "}}")) return -1;
  return n;
}

/* CSV line for Serial / SD logging. Header and row have the same columns. */
static inline int sample_csv_header(char *out, size_t cap) {
  int n = 0;
  if (cap == 0 || !sample_append(out, cap, n, "timestamp")) return -1;
  for (int i = 0; i < METRIC_COUNT; i++)
    if (!sample_append(out, cap, n, ",%s", METRIC_KEYS[i])) return -1;
  return n;
}

static inline int sample_to_csv(const Sample &s, char *out, size_t cap) {
  int n = 0;
  if (cap == 0 || !sample_append(out, cap, n, "%lu", (unsigned long)s.ts)) return -1;
  for (int i = 0; i < METRIC_COUNT; i++) {
    bool ok = std::isfinite(s.m[i]) ? sample_append(out, cap, n, ",%.2f", s.m[i])
                                    : sample_append(out, cap, n, ",");
    if (!ok) return -1;
  }
  return n;
}

#endif /* DEEM_SAMPLE_H */
