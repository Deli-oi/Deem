"""Deem Pi central controller.

Ingests telemetry from ESP32 devices over MQTT, buffers it durably, and
relays normalized readings to a (pluggable) web endpoint. Also publishes
commands back down to the ESP32s.
"""

__version__ = "0.1.0"
