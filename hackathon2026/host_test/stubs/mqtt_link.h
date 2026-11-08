#pragma once
/* Stand-in for the real mqtt_link.h: no network. The queue (batch.h) stays inspectable. */
#include "batch.h"
#include "sample.h"

static inline void link_begin() {}
static inline bool link_loop() { return true; }
static inline bool link_connected() { return false; } /* never flushes, so the test can read the queue */
static inline int link_flush(Batch &) { return 0; }
static inline void link_set_sensor_status(bool, bool, bool) {}
