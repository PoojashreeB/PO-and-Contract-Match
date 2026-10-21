import json
from pathlib import Path

from schemas.sap_schema import SapConfig

CONFIG_PATH = Path(__file__).parent.parent / "config" / "sap_config.json"


def load_config() -> SapConfig | None:
    if not CONFIG_PATH.exists():
        return None
    return SapConfig(**json.loads(CONFIG_PATH.read_text()))


def save_config(config: SapConfig) -> None:
    CONFIG_PATH.parent.mkdir(exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config.model_dump(), indent=2))
