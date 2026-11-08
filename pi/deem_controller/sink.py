"""Pluggable relay sinks.

A sink takes a batch of normalized telemetry envelopes and delivers them
somewhere. The real greenhouse web endpoint is not defined yet, so we ship:

  * LogSink  - prints batches; use during development.
  * HttpSink - POSTs batches as JSON to a configurable URL.

When the endpoint is finalized, in most cases only config.yaml needs to
change. If its payload shape differs, adjust HttpSink.build_body().
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

import requests

from .config import SinkConfig

log = logging.getLogger(__name__)


class Sink:
    def deliver(self, batch: List[Dict[str, Any]]) -> None:
        """Deliver a batch. Raise on failure so the caller can retry."""
        raise NotImplementedError


class LogSink(Sink):
    def deliver(self, batch: List[Dict[str, Any]]) -> None:
        for env in batch:
            log.info("[sink:log] %s @ %s -> %s", env.get("device_id"), env.get("ts"), env.get("metrics"))


class HttpSink(Sink):
    def __init__(self, cfg: SinkConfig) -> None:
        if not cfg.url:
            raise ValueError("sink.url is required when sink.type == 'http'")
        self.cfg = cfg
        self.session = requests.Session()
        if cfg.headers:
            self.session.headers.update(cfg.headers)

    def build_body(self, batch: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Shape of the HTTP payload. Adjust to match the real endpoint."""
        return {"readings": batch}

    def deliver(self, batch: List[Dict[str, Any]]) -> None:
        resp = self.session.request(
            self.cfg.method,
            self.cfg.url,
            json=self.build_body(batch),
            timeout=self.cfg.timeout_s,
        )
        resp.raise_for_status()


def make_sink(cfg: SinkConfig) -> Sink:
    kind = (cfg.type or "log").lower()
    if kind == "http":
        return HttpSink(cfg)
    if kind == "log":
        return LogSink()
    raise ValueError(f"unknown sink type: {cfg.type!r}")
