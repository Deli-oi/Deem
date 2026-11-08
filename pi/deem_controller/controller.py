"""Wires MQTT ingest -> durable buffer -> relay worker -> web endpoint."""
from __future__ import annotations

import logging
import threading
import time
from typing import List

from .buffer import Buffer
from .config import Config
from .models import Command, Telemetry
from .mqtt_client import MqttClient
from .sink import make_sink

log = logging.getLogger(__name__)


class Controller:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.buffer = Buffer(cfg.buffer.db_path, cfg.buffer.max_rows)
        self.sink = make_sink(cfg.sink)
        self.mqtt = MqttClient(
            cfg.mqtt,
            on_telemetry=self._handle_telemetry,
            on_status=self._handle_status,
        )
        self._stop = threading.Event()
        self._relay_thread = threading.Thread(
            target=self._relay_loop, name="relay-worker", daemon=True
        )

    # --- public API --------------------------------------------------------
    def start(self) -> None:
        log.info("starting Deem controller (sink=%s)", self.cfg.sink.type)
        self.mqtt.start()
        self._relay_thread.start()

    def run_forever(self) -> None:
        self.start()
        try:
            while not self._stop.is_set():
                self._stop.wait(1.0)
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()

    def stop(self) -> None:
        log.info("shutting down (%s readings still buffered)", self.buffer.pending_count())
        self._stop.set()
        self.mqtt.stop()
        if self._relay_thread.is_alive():
            self._relay_thread.join(timeout=5)
        self.buffer.close()

    def send_command(self, device_id: str, action: str, params: dict) -> Command:
        cmd = Command(action=action, params=params)
        self.mqtt.send_command(device_id, cmd)
        return cmd

    # --- MQTT handlers -----------------------------------------------------
    def _handle_telemetry(self, topic: str, payload: bytes) -> None:
        try:
            telemetry = Telemetry.from_message(topic, payload, self.cfg.mqtt.base_topic)
        except Exception as exc:  # noqa: BLE001
            log.warning("dropping malformed telemetry on %s: %s", topic, exc)
            return
        self.buffer.enqueue(telemetry.to_envelope())
        log.debug("buffered telemetry from %s", telemetry.device_id)

    def _handle_status(self, topic: str, payload: bytes) -> None:
        log.info("device status %s: %s", topic, payload.decode("utf-8", "replace"))

    # --- relay worker ------------------------------------------------------
    def _relay_loop(self) -> None:
        s = self.cfg.sink
        while not self._stop.is_set():
            batch = self.buffer.fetch_batch(s.batch_size)
            if not batch:
                self._stop.wait(s.flush_interval_s)
                continue

            ids: List[int] = [row_id for row_id, _ in batch]
            envelopes = [env for _, env in batch]
            try:
                self.sink.deliver(envelopes)
                self.buffer.mark_delivered(ids)
                log.info("relayed %s readings", len(ids))
            except Exception as exc:  # noqa: BLE001
                log.warning("relay failed for %s readings: %s", len(ids), exc)
                self.buffer.mark_failed(ids, s.max_retries, s.backoff_base_s, str(exc))
                # brief pause so we don't hot-loop while the endpoint is down
                self._stop.wait(min(s.flush_interval_s, 5.0))
