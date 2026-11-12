PLAYLIST_ID = "fakePlaylist01"


class SimulatedSpotifyError(Exception):
    pass


def track_uri(number):
    return f"spotify:track:t{number:05d}"


def build_track(uri):
    number = int(uri.rsplit("t", 1)[1])
    return {
        "uri": uri,
        "id": uri.rsplit(":", 1)[1],
        "name": f"Song {number % 97:03d} {number:05d}",
        "artists": [{"name": f"Artist {number % 13}"}],
        "album": {"name": f"Album {number % 7}", "release_date": f"20{number % 25:02d}-01-01", "images": []},
        "duration_ms": 1000 + number,
        "external_urls": {},
    }


class FakeSpotify:
    def __init__(self, uris, failing_calls=None, fail_every_write_after_first_failure=False):
        self.playlists = {PLAYLIST_ID: list(uris)}
        self.failing_calls = failing_calls or {}
        self.fail_every_write_after_first_failure = fail_every_write_after_first_failure
        self.call_counts = {}
        self.has_failed = False
        self.remove_batches = []

    def _count_call(self, method):
        self.call_counts[method] = self.call_counts.get(method, 0) + 1
        should_fail = self.call_counts[method] in self.failing_calls.get(method, ())
        if self.has_failed and self.fail_every_write_after_first_failure:
            should_fail = True
        if should_fail:
            self.has_failed = True
            raise SimulatedSpotifyError(f"429 rate limited (simulated {method} call {self.call_counts[method]})")

    def _page(self, playlist_id, offset, limit):
        uris = self.playlists[playlist_id]
        next_offset = offset + limit if offset + limit < len(uris) else None
        return {
            "items": [{"item": build_track(uri)} for uri in uris[offset:offset + limit]],
            "next": next_offset,
            "playlist_id": playlist_id,
            "limit": limit,
        }

    def playlist_items(self, playlist_id, limit=100):
        return self._page(playlist_id, 0, limit)

    def next(self, result):
        return self._page(result["playlist_id"], result["next"], result["limit"])

    def playlist_replace_items(self, playlist_id, items):
        if len(items) > 100:
            raise SimulatedSpotifyError("replace accepts at most 100 items")
        self._count_call("playlist_replace_items")
        self.playlists[playlist_id] = list(items)

    def playlist_add_items(self, playlist_id, items):
        if len(items) > 100:
            raise SimulatedSpotifyError("add accepts at most 100 items")
        self._count_call("playlist_add_items")
        self.playlists[playlist_id].extend(items)

    def playlist_remove_all_occurrences_of_items(self, playlist_id, items):
        self.remove_batches.append(len(items))
        if len(items) > 100:
            raise SimulatedSpotifyError("remove accepts at most 100 items")
        self._count_call("playlist_remove_all_occurrences_of_items")
        doomed = set(items)
        self.playlists[playlist_id] = [uri for uri in self.playlists[playlist_id] if uri not in doomed]
