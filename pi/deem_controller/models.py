"""Data models shared across the controller.

The canonical wire formats (MQTT topics + JSON payloads) are documented in
docs/mqtt_contract.md. Keep this module in sync with that spec.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


def device_id_from_topic(topic: str, base_topic: str) -> Optional[str]:
    """Extract <device_id> from 'deem/<device_id>/<suffix>'."""
    parts = topic.split("/")
    if len(parts) >= 3 and parts[0] == base_topic:
        return parts[1]
    return None


@dataclass
class Telemetry:
    """A single telemetry message published by an ESP32."""

    device_id: str
    ts: float  # device-reported epoch seconds (may be 0 if device has no clock)
    metrics: Dict[str, Any]
    fw: Optional[str] = None
    received_ts: float = field(default_factory=time.time)

    @classmethod
    def from_message(cls, topic: str, payload: bytes, base_topic: str) -> "Telemetry":
        data = json.loads(payload.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("telemetry payload must be a JSON object")

        device_id = data.get("device_id") or device_id_from_topic(topic, base_topic)
        if not device_id:
            raise ValueError(f"could not determine device_id from topic {topic!r}")

        metrics = data.get("metrics", {})
        if not isinstance(metrics, dict):
            raise ValueError("'metrics' must be a JSON object")

        ts = data.get("ts")
        try:
            ts = float(ts) if ts is not None else 0.0
        except (TypeError, ValueError):
            ts = 0.0

        return cls(
            device_id=str(device_id),
            ts=ts,
            metrics=metrics,
            fw=data.get("fw"),
        )

    def to_envelope(self) -> Dict[str, Any]:
        """Normalized record relayed to the web endpoint / stored in the buffer."""
        return {
            "device_id": self.device_id,
            "ts": self.ts,
            "received_ts": self.received_ts,
            "fw": self.fw,
            "metrics": self.metrics,
        }


@dataclass
class Command:
    """A command the Pi sends down to an ESP32."""

    action: str
    params: Dict[str, Any] = field(default_factory=dict)
    cmd_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    ts: float = field(default_factory=time.time)

    def to_payload(self) -> bytes:
        return json.dumps(
            {
                "cmd_id": self.cmd_id,
                "ts": self.ts,
                "action": self.action,
                "params": self.params,
            }
        ).encode("utf-8")
