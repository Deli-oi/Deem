"""End-to-end check: the Pi controller's real HttpSink -> this ingest service -> readings API.

Run from the repo root (needs `pip install -r pi/requirements.txt` and `npm install` in ingest/):
    python ingest/e2e_pi_sink.py
Starts the service on a free port with in-memory storage, relays two readings the way the
Pi does, and checks they come back from the public API.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pi"))

from deem_controller.config import SinkConfig  # noqa: E402
from deem_controller.models import Telemetry  # noqa: E402
from deem_controller.sink import HttpSink  # noqa: E402

PORT = 38417
TOKEN = "e2e-token"


def main() -> int:
    env = {k: v for k, v in os.environ.items() if k not in ("TIGER_DATABASE_URL", "DATABASE_URL")}
    env.update(PORT=str(PORT), DEEM_SINK_TOKEN=TOKEN)
    server = subprocess.Popen(["node", "server/index.mjs"], cwd=os.path.join(ROOT, "ingest"), env=env)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/healthz", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        else:
            print("FAIL: service did not start")
            return 1

        payload = b'{"device_id":"esp32-pot-01","ts":%d,"fw":"0.1.0","metrics":{"temp_c":22.4,"rh_pct":45,"co2_ppm":612,"soil_moisture":38}}'
        now = int(time.time())
        batch = [
            Telemetry.from_message("deem/esp32-pot-01/telemetry", payload % (now - 600), "deem").to_envelope(),
            Telemetry.from_message("deem/esp32-pot-01/telemetry", payload % now, "deem").to_envelope(),
        ]
        cfg = SinkConfig(
            type="http",
            url=f"http://127.0.0.1:{PORT}/ingest",
            method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
        )
        HttpSink(cfg).deliver(batch)

        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/readings?device_id=esp32-pot-01") as r:
            readings = json.load(r)["readings"]
        assert len(readings) == 2, readings
        assert readings[-1]["metrics"]["co2_ppm"] == 612, readings
        print("PASS: Pi HttpSink -> ingest -> API returned", len(readings), "readings")
        return 0
    finally:
        server.terminate()


if __name__ == "__main__":
    sys.exit(main())
