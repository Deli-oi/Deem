#ifndef DEEM_BATCH_H
#define DEEM_BATCH_H

/*
 * Store-and-forward queue between the sensors and MQTT.
 *
 * The contract (docs/mqtt_contract.md) is one telemetry message per sample, and
 * the Pi does its own batching toward the web endpoint. So this "batch" is a
 * ring buffer of samples waiting to be published, not a new message format:
 *   - normal case: a sample is queued and published right away
 *   - broker or WiFi down: samples pile up (oldest dropped when full) and are
 *     published in order once the link is back
 *   - optional burst mode: set BATCH_FLUSH_S=600 and the ESP32 holds samples
 *     and publishes them together every 10 minutes (still one message each)
 */

#include "sample.h"

/* Seconds of samples to collect before publishing. Default: publish at once. */
#ifndef BATCH_FLUSH_S
#define BATCH_FLUSH_S SAMPLE_INTERVAL_S
#endif

/* Samples to hold while offline. Default: about one hour (120 x 40 B = 4.8 KB at 30s). */
#ifndef BATCH_CAP
#define BATCH_CAP ((3600 / SAMPLE_INTERVAL_S) + 1)
#endif

/* Samples that make a batch "ready". */
#define BATCH_TARGET ((BATCH_FLUSH_S / SAMPLE_INTERVAL_S) > 0 ? (BATCH_FLUSH_S / SAMPLE_INTERVAL_S) : 1)

static_assert(BATCH_FLUSH_S >= SAMPLE_INTERVAL_S, "BATCH_FLUSH_S must be >= SAMPLE_INTERVAL_S");
static_assert(BATCH_CAP >= BATCH_TARGET, "BATCH_CAP must hold at least one full batch");

struct Batch {
  Sample rows[BATCH_CAP];
  uint16_t head = 0;      /* index of the oldest sample */
  uint16_t count = 0;     /* samples currently queued */
  uint32_t dropped = 0;   /* samples lost because the queue was full */
};

/* Queue a sample. If full, the oldest sample is discarded to make room. */
static inline void batch_push(Batch &b, const Sample &s) {
  if (b.count == BATCH_CAP) {
    b.head = (uint16_t)((b.head + 1) % BATCH_CAP);
    b.count--;
    b.dropped++;
  }
  b.rows[(b.head + b.count) % BATCH_CAP] = s;
  b.count++;
}

/* Copy the oldest sample into out without removing it. False if empty. */
static inline bool batch_peek(const Batch &b, Sample &out) {
  if (b.count == 0) return false;
  out = b.rows[b.head];
  return true;
}

/* Remove the oldest sample (call after it was published successfully). */
static inline void batch_pop(Batch &b) {
  if (b.count == 0) return;
  b.head = (uint16_t)((b.head + 1) % BATCH_CAP);
  b.count--;
}

/* True once a full batch worth of samples is waiting. */
static inline bool batch_ready(const Batch &b) {
  return b.count >= BATCH_TARGET;
}

#endif /* DEEM_BATCH_H */
