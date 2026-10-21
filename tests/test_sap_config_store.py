from schemas.sap_schema import SapConfig
from sap.config_store import load_config, save_config


def _make_config() -> SapConfig:
    return SapConfig(
        ashost="sap.example.com",
        sysnr="00",
        client="100",
        username="TECH_USER",
        password="super-secret",
    )


def test_load_config_returns_none_when_no_file_exists(tmp_path, monkeypatch):
    import sap.config_store as store

    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "sap_config.json")
    assert load_config() is None


def test_save_and_load_config_round_trip(tmp_path, monkeypatch):
    import sap.config_store as store

    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "sap_config.json")

    config = _make_config()
    save_config(config)
    loaded = load_config()

    assert loaded == config
