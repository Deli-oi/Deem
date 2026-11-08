"""Configuration loading for the Deem controller.

Reads a YAML file into typed dataclasses. Any string value may reference an
environment variable with ${VAR} syntax so secrets stay out of the file.
"""
from __future__ import annotations

import dataclasses
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import yaml


@dataclass
class MqttConfig:
    host: str = "localhost"
    port: int = 1883
    username: Optional[str] = None
    password: Optional[str] = None
    base_topic: str = "deem"
    client_id: str = "deem-controller"
    keepalive: int = 60


@dataclass
class BufferConfig:
    db_path: str = "./deem_buffer.sqlite3"
    max_rows: int = 100_000


@dataclass
class SinkConfig:
    type: str = "log"  # "log" or "http"
    url: Optional[str] = None
    method: str = "POST"
    headers: Dict[str, str] = field(default_factory=dict)
    batch_size: int = 50
    flush_interval_s: float = 5.0
    timeout_s: float = 10.0
    max_retries: int = 8
    backoff_base_s: float = 2.0


@dataclass
class Config:
    mqtt: MqttConfig = field(default_factory=MqttConfig)
    buffer: BufferConfig = field(default_factory=BufferConfig)
    sink: SinkConfig = field(default_factory=SinkConfig)
    log_level: str = "INFO"


def _expand_env(value: Any) -> Any:
    """Recursively expand ${VAR} references in all string leaves."""
    if isinstance(value, str):
        return os.path.expandvars(value)
    if isinstance(value, dict):
        return {k: _expand_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand_env(v) for v in value]
    return value


def _build(cls, data: Optional[Dict[str, Any]]):
    """Instantiate a dataclass, ignoring unknown keys so configs stay forgiving."""
    data = data or {}
    known = {f.name for f in dataclasses.fields(cls)}
    return cls(**{k: v for k, v in data.items() if k in known})


def load(path: str) -> Config:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    raw = _expand_env(raw)
    return Config(
        mqtt=_build(MqttConfig, raw.get("mqtt")),
        buffer=_build(BufferConfig, raw.get("buffer")),
        sink=_build(SinkConfig, raw.get("sink")),
        log_level=raw.get("log_level", "INFO"),
    )
