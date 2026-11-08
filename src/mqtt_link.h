#ifndef DEEM_MQTT_LINK_H
#define DEEM_MQTT_LINK_H

/*
 * WiFi + MQTT link to the Pi (docs/mqtt_contract.md v1).
 *
 *   ESP32 --telemetry--> deem/<device_id>/telemetry   (one JSON per sample)
 *   ESP32 --status-----> deem/<device_id>/status      (retained; Last Will = offline)
 *   ESP32 <--command--- deem/<device_id>/cmd          (ack on cmd/ack)
 *
 * Needs  knolleary/PubSubClient@^2.8  in platformio.ini lib_deps.
 * Include this header from main.cpp only (it holds the connection state).
 *
 * QoS: the contract asks for QoS 1, but PubSubClient can only PUBLISH at
 * QoS 0 (it can subscribe at QoS 1). The queue in batch.h only removes a
 * sample after publish() succeeds, which covers a dropped link but not a
 * message lost on the wire. For true QoS 1 swap the library; the only call to
 * change is the publish in link_flush().
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "sample.h"
#include "batch.h"

#ifndef LINK_JSON_MAX
#define LINK_JSON_MAX 384   /* one telemetry JSON; 9 metrics need about 300 */
#endif
#ifndef LINK_PACKET_MAX
#define LINK_PACKET_MAX 512 /* PubSubClient buffer: topic + payload + header must fit */
#endif
#ifndef MQTT_RETRY_MS
#define MQTT_RETRY_MS 5000  /* wait between broker connect attempts */
#endif
#ifndef MQTT_SOCKET_TIMEOUT_S
#define MQTT_SOCKET_TIMEOUT_S 3 /* keep a dead broker from freezing loop() for long */
#endif

static_assert(LINK_PACKET_MAX >= LINK_JSON_MAX + 64, "LINK_PACKET_MAX must exceed LINK_JSON_MAX + topic + header");

static WiFiClient _link_net;
static PubSubClient _link_mqtt(_link_net);
static char _link_topic_tel[64];
static char _link_topic_status[64];
static char _link_topic_cmd[64];
static char _link_topic_ack[64];
static bool _link_sensor_dht_started = false;
static bool _link_sensor_air_started = false;
static bool _link_sensor_soil_started = false;

static inline void link_set_sensor_status(bool dhtStarted, bool airStarted, bool soilStarted) {
  _link_sensor_dht_started = dhtStarted;
  _link_sensor_air_started = airStarted;
  _link_sensor_soil_started = soilStarted;
}

static inline void link_on_command(char *topic, byte *payload, unsigned int len) {
  (void)topic;
  JsonDocument command;
  if (deserializeJson(command, payload, len)) return;

  const char *cmd_id = command["cmd_id"] | "";
  if (cmd_id[0] == '\0') return;

  /*
   * No relay or other command-controlled hardware is wired in this firmware.
   * Acknowledge unsupported actions as failed rather than claiming success.
   */
  JsonDocument ack;
  ack["cmd_id"] = cmd_id;
  ack["ok"] = false;

  char buf[128];
  size_t n = serializeJson(ack, buf, sizeof(buf));
  if (n > 0) {
    _link_mqtt.publish(_link_topic_ack, (const uint8_t *)buf, (unsigned int)n, false);
  }
}

/* Call once from setup(). Does not block waiting for WiFi. */
static inline void link_begin() {
  snprintf(_link_topic_tel, sizeof(_link_topic_tel), "%s/%s/telemetry", MQTT_BASE_TOPIC, DEVICE_ID);
  snprintf(_link_topic_status, sizeof(_link_topic_status), "%s/%s/status", MQTT_BASE_TOPIC, DEVICE_ID);
  snprintf(_link_topic_cmd, sizeof(_link_topic_cmd), "%s/%s/cmd", MQTT_BASE_TOPIC, DEVICE_ID);
  snprintf(_link_topic_ack, sizeof(_link_topic_ack), "%s/%s/cmd/ack", MQTT_BASE_TOPIC, DEVICE_ID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  _link_mqtt.setServer(MQTT_HOST, MQTT_PORT);
  _link_mqtt.setCallback(link_on_command);
  _link_mqtt.setBufferSize(LINK_PACKET_MAX);
  _link_mqtt.setSocketTimeout(MQTT_SOCKET_TIMEOUT_S);

  configTime(0, 0, NTP_SERVER);
}

/*
 * Call every loop(). Keeps the broker connection alive and reconnects (at most
 * once per MQTT_RETRY_MS) without blocking. Returns true while connected.
 */
static inline bool link_loop() {
  if (WiFi.status() != WL_CONNECTED) return false;

  if (!_link_mqtt.connected()) {
    static bool tried = false;
    static uint32_t last_try = 0;
    uint32_t now = millis();
    if (tried && (uint32_t)(now - last_try) < MQTT_RETRY_MS) return false;
    tried = true;
    last_try = now;

    /* Last Will: the broker publishes "offline" (retained) if we vanish. */
    if (!_link_mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASS,
                            _link_topic_status, 1, true, "{\"state\":\"offline\"}")) {
      Serial.printf("MQTT connection failed, state=%d\n", _link_mqtt.state());
      return false;
    }
    char status[192];
    int statusLength = snprintf(
        status, sizeof(status),
        "{\"state\":\"online\",\"fw\":\"%s\",\"sensors\":{\"dht\":%s,\"air\":%s,\"soil\":%s}}",
        FW_VERSION,
        _link_sensor_dht_started ? "true" : "false",
        _link_sensor_air_started ? "true" : "false",
        _link_sensor_soil_started ? "true" : "false");
    if (statusLength < 0 || (size_t)statusLength >= sizeof(status)) {
      Serial.println("Failed to format MQTT online status");
    } else if (!_link_mqtt.publish(_link_topic_status, status, true)) {
      Serial.println("Failed to publish MQTT online status");
    }
    if (!_link_mqtt.subscribe(_link_topic_cmd, 1)) {
      Serial.println("Failed to subscribe to MQTT command topic");
    }
  }

  _link_mqtt.loop();
  return true;
}

static inline bool link_connected() {
  return _link_mqtt.connected();
}

/*
 * Publish queued samples oldest first. A sample leaves the queue only after
 * publish() accepted it; on the first failure we stop and retry next time.
 * A sample with no readings can never be sent, so it is discarded.
 * Returns how many telemetry messages were published.
 */
static inline int link_flush(Batch &b) {
  int sent = 0;
  Sample s;
  char buf[LINK_JSON_MAX];

  while (_link_mqtt.connected() && batch_peek(b, s)) {
    int n = sample_to_json(s, buf, sizeof(buf));
    if (n > 0) {
      if (!_link_mqtt.publish(_link_topic_tel, (const uint8_t *)buf, (unsigned int)n, true)) break;
      sent++;
    }
    batch_pop(b);
    _link_mqtt.loop();
  }
  return sent;
}

#endif /* DEEM_MQTT_LINK_H */
