import json

import pytest

import server
from fake_spotify import PLAYLIST_ID, track_uri

ORIGINAL_URIS = [track_uri(number) for number in range(1000)]
THIRD_APPEND = {"playlist_add_items": {3}}


def test_save_writes_the_new_order(make_spotify):
    fake = make_spotify(uris=ORIGINAL_URIS)
    new_order = list(reversed(ORIGINAL_URIS))

    server.save_playlist_order(PLAYLIST_ID, new_order)

    assert fake.playlists[PLAYLIST_ID] == new_order


def test_failed_save_restores_the_original_order(make_spotify):
    fake = make_spotify(uris=ORIGINAL_URIS, failing_calls=THIRD_APPEND)

    with pytest.raises(Exception, match="restored"):
        server.save_playlist_order(PLAYLIST_ID, list(reversed(ORIGINAL_URIS)))

    assert fake.playlists[PLAYLIST_ID] == ORIGINAL_URIS


def test_failed_restore_reports_a_backup_holding_the_original_uris(make_spotify):
    fake = make_spotify(uris=ORIGINAL_URIS, failing_calls=THIRD_APPEND, fail_every_write_after_first_failure=True)

    with pytest.raises(Exception) as raised:
        server.save_playlist_order(PLAYLIST_ID, list(reversed(ORIGINAL_URIS)))

    message = str(raised.value)
    assert "restore" in message.lower() and "failed" in message.lower()
    backups = list(server.PLAYLIST_BACKUP_DIR.glob("*.json"))
    assert len(backups) == 1
    assert str(backups[0]) in message
    assert json.loads(backups[0].read_text())["track_uris"] == ORIGINAL_URIS
    assert len(fake.playlists[PLAYLIST_ID]) < len(ORIGINAL_URIS)


def test_successful_save_and_restore_leave_no_backup_behind(make_spotify):
    make_spotify(uris=ORIGINAL_URIS)
    server.save_playlist_order(PLAYLIST_ID, list(reversed(ORIGINAL_URIS)))

    make_spotify(uris=ORIGINAL_URIS, failing_calls=THIRD_APPEND)
    with pytest.raises(Exception):
        server.save_playlist_order(PLAYLIST_ID, list(reversed(ORIGINAL_URIS)))

    assert list(server.PLAYLIST_BACKUP_DIR.glob("*.json")) == []


def test_failed_sort_restores_the_original_order(make_spotify):
    fake = make_spotify(uris=ORIGINAL_URIS, failing_calls=THIRD_APPEND)

    with pytest.raises(Exception, match="restored"):
        server.sort_playlist(PLAYLIST_ID, sort_by="name")

    assert fake.playlists[PLAYLIST_ID] == ORIGINAL_URIS


def test_failed_duplicate_removal_restores_the_original_order(make_spotify):
    with_duplicates = ORIGINAL_URIS + ORIGINAL_URIS[:150]
    fake = make_spotify(uris=with_duplicates, failing_calls=THIRD_APPEND)

    with pytest.raises(Exception, match="restored"):
        server.remove_duplicate_tracks(PLAYLIST_ID)

    assert fake.playlists[PLAYLIST_ID] == with_duplicates
