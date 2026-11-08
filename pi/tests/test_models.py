import json

import pytest

from deem_controller.models import Command, Telemetry, device_id_from_topic


def test_device_id_from_topic():
    assert device_id_from_topic("deem/esp32-aqi-01/telemetry", "deem") == "esp32-aqi-01"
    assert device_id_from_topic("deem/x/status", "deem") == "x"
    assert device_id_from_topic("other/x/telemetry", "deem") is None
    assert device_id_from_topic("deem", "deem") is None


def test_telemetry_from_message_full():
    payload = json.dumps(
        {
            "device_id": "esp32-aqi-01",
            "ts": 1730000000,
            "fw": "0.1.0",
            "metrics": {"co2_ppm": 812, "temp_c": 22.4},
        }
    ).encode()
    t = Telemetry.from_message("deem/esp32-aqi-01/telemetry", payload, "deem")
    assert t.device_id == "esp32-aqi-01"
    assert t.ts == 1730000000.0
    assert t.fw == "0.1.0"
    assert t.metrics["co2_ppm"] == 812

    env = t.to_envelope()
    assert env["device_id"] == "esp32-aqi-01"
    assert env["metrics"]["temp_c"] == 22.4
    assert "received_ts" in env


def test_telemetry_device_id_fallback_from_topic():
    t = Telemetry.from_message(
        "deem/esp32-soil-02/telemetry", b'{"metrics":{"soil_moisture":500}}', "deem"
    )
    assert t.device_id == "esp32-soil-02"
    assert t.ts == 0.0  # no ts provided -> 0


def test_telemetry_bad_ts_defaults_zero():
    t = Telemetry.from_message(
        "deem/d/telemetry", b'{"ts":"not-a-number","metrics":{}}', "deem"
    )
    assert t.ts == 0.0


def test_telemetry_rejects_non_object():
    with pytest.raises(ValueError):
        Telemetry.from_message("deem/d/telemetry", b"[1,2,3]", "deem")


def test_telemetry_rejects_bad_metrics():
    with pytest.raises(ValueError):
        Telemetry.from_message("deem/d/telemetry", b'{"metrics":[]}', "deem")


def test_telemetry_requires_device_id():
    # No device_id in payload and topic can't yield one.
    with pytest.raises(ValueError):
        Telemetry.from_message("deem", b'{"metrics":{}}', "deem")


def test_command_payload_roundtrip():
    c = Command(action="set_relay", params={"channel": 1, "state": "on"})
    data = json.loads(c.to_payload())
    assert data["action"] == "set_relay"
    assert data["params"] == {"channel": 1, "state": "on"}
    assert data["cmd_id"]
    assert "ts" in data
