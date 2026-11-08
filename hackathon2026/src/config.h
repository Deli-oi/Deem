#ifndef DEEM_CONFIG_H
#define DEEM_CONFIG_H

/*
 * Device-wide settings. Every value can be overridden without editing this
 * file, either from a secrets.h next to it (keep that out of git) or with
 * -D flags in platformio.ini build_flags, e.g.  -DSAMPLE_INTERVAL_S=60
 */

#ifndef WIFI_SSID
#define WIFI_SSID "WIFIUSER"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "WIFIPASS"
#endif

/* The Pi's Mosquitto broker (docs/mqtt_contract.md: plain TCP 1883 on the LAN). */
#ifndef MQTT_HOST
#define MQTT_HOST "192.168.1.50"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#ifndef MQTT_USER
#define MQTT_USER nullptr
#endif
#ifndef MQTT_PASS
#define MQTT_PASS nullptr
#endif
#ifndef MQTT_BASE_TOPIC
#define MQTT_BASE_TOPIC "deem"
#endif

/* One ESP32 per pot. Lowercase, no spaces or slashes, e.g. esp32-pot-02. */
#ifndef DEVICE_ID
#define DEVICE_ID "esp32-pot-01"
#endif
#ifndef FW_VERSION
#define FW_VERSION "0.1.0"
#endif

/*
 * The ESP32 has no RTC. If this server is reachable the samples carry a real
 * epoch "ts"; if not, ts is sent as 0 and the Pi stamps its own received_ts
 * (as the contract allows). On a LAN with no internet, point this at the Pi
 * if it runs an NTP server.
 */
#ifndef NTP_SERVER
#define NTP_SERVER "pool.ntp.org"
#endif

#endif /* DEEM_CONFIG_H */
