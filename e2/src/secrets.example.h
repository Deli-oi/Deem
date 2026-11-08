// Deem pot-node secrets — copy this file to secrets.h and fill in your values.
//   cp e2/src/secrets.example.h e2/src/secrets.h
// secrets.h is gitignored so your WiFi password never gets committed.
#pragma once

// --- WiFi (the ESP32 joins this network as a client) ---
#define WIFI_SSID        "your-hotspot-name"     // e.g. your iPhone Personal Hotspot
#define WIFI_PASS        "your-hotspot-password"

// --- Identity: unique per pot (esp32-pot-<nn>) ---
#define DEVICE_ID        "esp32-pot-01"

// --- Broker (the Pi) ---
// Preferred: resolve the Pi by mDNS hostname (survives DHCP IP changes).
// MQTT_MDNS_HOST is the hostname WITHOUT the ".local" suffix.
#define MQTT_MDNS_HOST   "connorlamora"          // -> connorlamora.local
// Fallback used only if the mDNS lookup fails:
#define MQTT_FALLBACK_IP "172.20.10.5"
#define MQTT_PORT        1883

// --- Relay (5V relay module, channel 1) ---
#define RELAY_PIN         26
#define RELAY_ACTIVE_HIGH 1                        // set 0 for active-low relay boards
