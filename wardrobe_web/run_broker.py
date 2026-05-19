from __future__ import annotations

import asyncio
from pathlib import Path

import yaml
from amqtt.broker import Broker


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "broker_config.yml"


async def main() -> None:
    with CONFIG_PATH.open("r", encoding="utf-8") as fh:
        config = yaml.safe_load(fh)
    broker = Broker(config)
    await broker.start()
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
