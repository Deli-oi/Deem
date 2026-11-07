import pytest

from deem_controller.config import SinkConfig
from deem_controller.sink import HttpSink, LogSink, make_sink


def test_make_log_sink():
    assert isinstance(make_sink(SinkConfig(type="log")), LogSink)


def test_make_http_sink_requires_url():
    with pytest.raises(ValueError):
        make_sink(SinkConfig(type="http", url=None))


def test_unknown_sink_type_raises():
    with pytest.raises(ValueError):
        make_sink(SinkConfig(type="nope"))


def test_log_sink_deliver_is_noop():
    # Should not raise.
    LogSink().deliver([{"device_id": "d", "ts": 0, "metrics": {}}])


def test_http_sink_build_body_shape():
    sink = make_sink(SinkConfig(type="http", url="https://x/ingest"))
    assert isinstance(sink, HttpSink)
    body = sink.build_body([{"device_id": "d"}])
    assert body == {"readings": [{"device_id": "d"}]}


def test_http_sink_deliver_posts_json(monkeypatch):
    sink = make_sink(SinkConfig(type="http", url="https://x/ingest"))
    calls = {}

    class FakeResp:
        def raise_for_status(self):
            calls["raised"] = True

    def fake_request(method, url, json, timeout):
        calls.update(method=method, url=url, json=json, timeout=timeout)
        return FakeResp()

    monkeypatch.setattr(sink.session, "request", fake_request)
    sink.deliver([{"device_id": "d"}])

    assert calls["method"] == "POST"
    assert calls["url"] == "https://x/ingest"
    assert calls["json"] == {"readings": [{"device_id": "d"}]}
    assert calls["raised"] is True
