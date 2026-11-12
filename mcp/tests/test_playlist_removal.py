import server
from fake_spotify import PLAYLIST_ID, track_uri

ORIGINAL_URIS = [track_uri(number) for number in range(1000)]


def test_removal_is_sent_in_batches_of_one_hundred(make_spotify):
    fake = make_spotify(uris=ORIGINAL_URIS)

    server.remove_tracks_from_playlist(PLAYLIST_ID, ORIGINAL_URIS[:250])

    assert fake.remove_batches == [100, 100, 50]
    assert fake.playlists[PLAYLIST_ID] == ORIGINAL_URIS[250:]
