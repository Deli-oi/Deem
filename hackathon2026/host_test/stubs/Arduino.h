#pragma once
/* Just enough of Arduino to run the firmware's logic on a PC (see host_test/README.md). */
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <cmath>
#include <ctime>

typedef bool boolean;
typedef uint8_t byte;

extern unsigned long g_millis; /* the test moves time forward by hand */
inline unsigned long millis() { return g_millis; }
inline void delay(unsigned long ms) { g_millis += ms; } /* a blocking delay still lets time pass */

using std::isnan;

template <class T, class A, class B>
T constrain(T x, A a, B b) { return x < (T)a ? (T)a : (x > (T)b ? (T)b : x); }
inline long map(long x, long in_min, long in_max, long out_min, long out_max) {
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

struct SerialStub {
  void begin(int) {}
  void println(const char *) {}
  void println() {}
  int printf(const char *, ...) { return 0; }
};
extern SerialStub Serial;
