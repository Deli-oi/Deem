from deem_controller import config as config_mod


def test_load_with_env_expansion(tmp_path, monkeypatch):
    monkeypatch.setenv("DEEM_TEST_TOKEN", "secret123")
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(
        "\n".join(
            [
                "log_level: DEBUG",
                "mqtt:",
                "  host: pi.local",
                "  port: 1884",
                "  unknown_key: ignored",  # unknown keys must be ignored
                "sink:",
                "  type: http",
                "  url: https://example.com/ingest",
                "  headers:",
                "    Authorization: Bearer ${DEEM_TEST_TOKEN}",
            ]
        )
    )
    cfg = config_mod.load(str(cfg_file))
    assert cfg.log_level == "DEBUG"
    assert cfg.mqtt.host == "pi.local"
    assert cfg.mqtt.port == 1884
    assert cfg.sink.type == "http"
    assert cfg.sink.headers["Authorization"] == "Bearer secret123"


def test_load_defaults_for_empty_file(tmp_path):
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text("{}")
    cfg = config_mod.load(str(cfg_file))
    assert cfg.mqtt.base_topic == "deem"
    assert cfg.buffer.max_rows == 100000
    assert cfg.sink.type == "log"
