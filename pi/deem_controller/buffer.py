"""Durable, SQLite-backed buffer for telemetry awaiting relay.

Readings are persisted immediately on receipt so nothing is lost if the web
endpoint is unreachable or the process restarts. The relay worker drains
pending rows in batches; failures are retried with backoff, and rows that
exhaust their retries are moved to a dead-letter table for inspection.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from typing import Any, Dict, List, Tuple

log = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS pending (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id       TEXT,
    payload         TEXT NOT NULL,
    received_ts     REAL NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_ts REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pending_next ON pending(next_attempt_ts);

CREATE TABLE IF NOT EXISTS dead (
    id          INTEGER PRIMARY KEY,
    device_id   TEXT,
    payload     TEXT NOT NULL,
    received_ts REAL NOT NULL,
    attempts    INTEGER NOT NULL,
    died_ts     REAL NOT NULL,
    last_error  TEXT
);
"""


class Buffer:
    def __init__(self, db_path: str, max_rows: int = 100_000) -> None:
        self.max_rows = max_rows
        self._lock = threading.Lock()
        # check_same_thread=False: we guard all access with our own lock.
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(_SCHEMA)
        self._db.commit()

    def enqueue(self, envelope: Dict[str, Any]) -> None:
        payload = json.dumps(envelope)
        with self._lock:
            self._db.execute(
                "INSERT INTO pending (device_id, payload, received_ts) VALUES (?, ?, ?)",
                (envelope.get("device_id"), payload, envelope.get("received_ts", time.time())),
            )
            self._trim_locked()
            self._db.commit()

    def fetch_batch(self, limit: int) -> List[Tuple[int, Dict[str, Any]]]:
        now = time.time()
        with self._lock:
            rows = self._db.execute(
                "SELECT id, payload FROM pending "
                "WHERE next_attempt_ts <= ? ORDER BY id ASC LIMIT ?",
                (now, limit),
            ).fetchall()
        return [(r["id"], json.loads(r["payload"])) for r in rows]

    def mark_delivered(self, ids: List[int]) -> None:
        if not ids:
            return
        with self._lock:
            self._db.executemany("DELETE FROM pending WHERE id = ?", [(i,) for i in ids])
            self._db.commit()

    def mark_failed(
        self, ids: List[int], max_retries: int, backoff_base_s: float, error: str = ""
    ) -> None:
        """Bump attempts + schedule a retry, or dead-letter if retries exhausted."""
        if not ids:
            return
        now = time.time()
        with self._lock:
            for row_id in ids:
                row = self._db.execute(
                    "SELECT attempts FROM pending WHERE id = ?", (row_id,)
                ).fetchone()
                if row is None:
                    continue
                attempts = row["attempts"] + 1
                if attempts >= max_retries:
                    self._db.execute(
                        "INSERT OR REPLACE INTO dead "
                        "(id, device_id, payload, received_ts, attempts, died_ts, last_error) "
                        "SELECT id, device_id, payload, received_ts, ?, ?, ? "
                        "FROM pending WHERE id = ?",
                        (attempts, now, error[:500], row_id),
                    )
                    self._db.execute("DELETE FROM pending WHERE id = ?", (row_id,))
                    log.warning("record %s dead-lettered after %s attempts", row_id, attempts)
                else:
                    delay = backoff_base_s * (2 ** (attempts - 1))
                    self._db.execute(
                        "UPDATE pending SET attempts = ?, next_attempt_ts = ? WHERE id = ?",
                        (attempts, now + delay, row_id),
                    )
            self._db.commit()

    def pending_count(self) -> int:
        with self._lock:
            return self._db.execute("SELECT COUNT(*) AS c FROM pending").fetchone()["c"]

    def _trim_locked(self) -> None:
        """Drop oldest pending rows beyond max_rows (caller holds the lock)."""
        count = self._db.execute("SELECT COUNT(*) AS c FROM pending").fetchone()["c"]
        overflow = count - self.max_rows
        if overflow > 0:
            self._db.execute(
                "DELETE FROM pending WHERE id IN "
                "(SELECT id FROM pending ORDER BY id ASC LIMIT ?)",
                (overflow,),
            )
            log.warning("buffer over capacity; dropped %s oldest rows", overflow)

    def close(self) -> None:
        with self._lock:
            self._db.close()
