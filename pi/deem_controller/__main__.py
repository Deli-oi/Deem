"""Entry point.

Run the service:
    python -m deem_controller --config config.yaml

Send a test command to a device and exit:
    python -m deem_controller --config config.yaml send \
        --device esp32-aqi-01 --action set_relay --params '{"channel":1,"state":"on"}'
"""
from __future__ import annotations

import argparse
import json
import logging
import signal
import sys

from . import config as config_mod
from .controller import Controller


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="deem_controller")
    parser.add_argument("--config", default="config.yaml", help="path to config YAML")

    sub = parser.add_subparsers(dest="command")
    send = sub.add_parser("send", help="publish a command to a device and exit")
    send.add_argument("--device", required=True)
    send.add_argument("--action", required=True)
    send.add_argument("--params", default="{}", help="JSON object of command params")

    args = parser.parse_args(argv)
    cfg = config_mod.load(args.config)
    _setup_logging(cfg.log_level)

    controller = Controller(cfg)

    if args.command == "send":
        params = json.loads(args.params)
        controller.mqtt.start()
        try:
            cmd = controller.send_command(args.device, args.action, params)
            print(f"sent command {cmd.cmd_id} -> {args.device}")
        finally:
            controller.mqtt.stop()
        return 0

    # Default: run the service until SIGINT/SIGTERM.
    def _handle_signal(signum, frame):
        controller.stop()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _handle_signal)
    controller.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
