import time

from deem_controller.buffer import Buffer


def make_env(device_id="d1", **metrics):
    return {
        "device_id": device_id,
        "ts": 0,
        "received_ts": time.time(),
        "fw": "test",
        "metrics": metrics,
    }


def test_enqueue_fetch_deliver(tmp_path):
    buf = Buffer(str(tmp_path / "b.sqlite3"))
    buf.enqueue(make_env(co2_ppm=800))
    buf.enqueue(make_env(co2_ppm=810))
    assert buf.pending_count() == 2

    batch = buf.fetch_batch(10)
    assert len(batch) == 2
    ids = [i for i, _ in batch]
    # payloads come back parsed
    assert batch[0][1]["metrics"]["co2_ppm"] == 800

    buf.mark_delivered(ids)
    assert buf.pending_count() == 0
    buf.close()


def test_fetch_respects_limit(tmp_path):
    buf = Buffer(str(tmp_path / "b.sqlite3"))
    for i in range(5):
        buf.enqueue(make_env(n=i))
    assert len(buf.fetch_batch(3)) == 3
    buf.close()


def test_retry_then_dead_letter(tmp_path):
    buf = Buffer(str(tmp_path / "b.sqlite3"))
    buf.enqueue(make_env(n=1))
    # backoff 0 so the row is immediately eligible for the next attempt
    for _ in range(5):
        batch = buf.fetch_batch(10)
        buf.mark_failed(
            [i for i, _ in batch], max_retries=3, backoff_base_s=0.0, error="boom"
        )
    assert buf.pending_count() == 0  # exhausted retries -> dead-lettered
    dead = buf._db.execute("SELECT COUNT(*) AS c FROM dead").fetchone()["c"]
    assert dead == 1
    buf.close()


def test_backoff_delays_next_attempt(tmp_path):
    buf = Buffer(str(tmp_path / "b.sqlite3"))
    buf.enqueue(make_env(n=1))
    batch = buf.fetch_batch(10)
    buf.mark_failed(
        [i for i, _ in batch], max_retries=5, backoff_base_s=100.0, error="boom"
    )
    # next_attempt_ts is in the future, so it should not be fetched yet
    assert buf.fetch_batch(10) == []
    assert buf.pending_count() == 1
    buf.close()


def test_trim_enforces_max_rows(tmp_path):
    buf = Buffer(str(tmp_path / "b.sqlite3"), max_rows=3)
    for i in range(6):
        buf.enqueue(make_env(n=i))
    assert buf.pending_count() == 3
    buf.close()
