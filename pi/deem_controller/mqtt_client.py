"""Thin wrapper around paho-mqtt (callback API v2).

Subscribes to ESP32 telemetry + status topics and forwards messages to a
handler. Also publishes commands down to devices. Topic layout is defined in
docs/mqtt_contract.md.
"""
from __future__ import annotations

import logging
from typing import Callable, Optional

import paho.mqtt.client as mqtt

from .config import MqttConfig
from .models import Command

log = logging.getLogger(__name__)

# Handler signature: (topic: str, payload: bytes) -> None
MessageHandler = Callable[[str, bytes], None]


class MqttClient:
    def __init__(self, cfg: MqttConfig, on_telemetry: MessageHandler,
                 on_status: Optional[MessageHandler] = None) -> None:
        self.cfg = cfg
        self._on_telemetry = on_telemetry
        self._on_status = on_status

        self._client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=cfg.client_id,
            clean_session=True,
        )
        if cfg.username:
            self._client.username_pw_set(cfg.username, cfg.password)

        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

        # Topic patterns
        self._telemetry_sub = f"{cfg.base_topic}/+/telemetry"
        self._status_sub = f"{cfg.base_topic}/+/status"

    # --- lifecycle ---------------------------------------------------------
    def start(self) -> None:
        log.info("connecting to MQTT broker %s:%s", self.cfg.host, self.cfg.port)
        self._client.connect(self.cfg.host, self.cfg.port, self.cfg.keepalive)
        self._client.loop_start()  # background network thread + auto-reconnect

    def stop(self) -> None:
        self._client.loop_stop()
        try:
            self._client.disconnect()
        except Exception:  # noqa: BLE001 - best effort on shutdown
            pass

    # --- publishing --------------------------------------------------------
    def send_command(self, device_id: str, command: Command) -> None:
        topic = f"{self.cfg.base_topic}/{device_id}/cmd"
        info = self._client.publish(topic, command.to_payload(), qos=1)
        log.info("sent command %s (%s) to %s", command.cmd_id, command.action, device_id)
        info.wait_for_publish(timeout=5)

    # --- callbacks ---------------------------------------------------------
    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code != 0:
            log.error("MQTT connect failed: %s", reason_code)
            return
        client.subscribe([(self._telemetry_sub, 1), (self._status_sub, 1)])
        log.info("subscribed to %s and %s", self._telemetry_sub, self._status_sub)

    def _on_disconnect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code != 0:
            log.warning("MQTT disconnected (%s); paho will auto-reconnect", reason_code)

    def _on_message(self, client, userdata, msg) -> None:
        try:
            if msg.topic.endswith("/telemetry"):
                self._on_telemetry(msg.topic, msg.payload)
            elif msg.topic.endswith("/status") and self._on_status:
                self._on_status(msg.topic, msg.payload)
        except Exception:  # noqa: BLE001 - never let a bad message kill the loop
            log.exception("error handling message on %s", msg.topic)
