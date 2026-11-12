import sys
import types

import pytest

from fake_spotify import FakeSpotify

stand_in_config = types.ModuleType("config")
stand_in_config.sp = None
sys.modules["config"] = stand_in_config

import server  # noqa: E402


@pytest.fixture
def make_spotify(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "PLAYLIST_BACKUP_DIR", tmp_path / "playlist-backups", raising=False)

    def build(**kwargs):
        fake = FakeSpotify(**kwargs)
        monkeypatch.setattr(server, "sp", fake)
        return fake

    return build
