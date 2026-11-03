from config import sp
from mcp.server.fastmcp import FastMCP
import base64
import logging
import requests
from settings import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spotify-mcp-server")

mcp = FastMCP("spotify-mcp-server")


@mcp.tool()
def play() -> str:
    sp.start_playback()
    return "Playing the current track"

@mcp.tool()
def pause() -> str:
    sp.pause_playback()
    return "Paused the current track"

@mcp.tool()
def next_track() -> str:
    sp.next_track()
    return "Skipped to the next track"

@mcp.tool()
def previous_track() -> str:
    sp.previous_track()
    return "Returned to the previous track"

@mcp.tool()
def set_shuffle(enabled: bool) -> str:
    sp.shuffle(enabled)
    return f"Shuffle {'enabled' if enabled else 'disabled'}"

@mcp.tool()
def repeat() -> str:
    sp.repeat("context")
    return "Repeat context enabled"

@mcp.tool()
def repeat_track() -> str:
    sp.repeat("track")
    return "Repeat track enabled"

@mcp.tool()
def repeat_off() -> str:
    sp.repeat("off")
    return "Repeat turned off"

@mcp.tool()
def set_volume(volume_percent: int) -> str:
    sp.volume(max(0, min(100, volume_percent)))
    return f"Volume set to {volume_percent}%"

@mcp.tool()
def seek(position_ms: int) -> str:
    sp.seek_track(max(0, position_ms))
    return f"Seeked to {position_ms}ms"

@mcp.tool()
def get_queue() -> dict:
    def _fmt(t):
        if not t:
            return None
        album = t.get("album") or {}
        images = album.get("images") or []
        return {
            "name": t.get("name", ""),
            "artists": [a["name"] for a in t.get("artists", [])],
            "image": images[-1]["url"] if images else None,
            "uri": t.get("uri", ""),
        }

    data = sp.queue()
    return {
        "currently_playing": _fmt(data.get("currently_playing")),
        "queue": [_fmt(t) for t in (data.get("queue") or [])[:10] if t],
    }

@mcp.tool()
def is_track_saved(track_id: str) -> dict:
    result = sp.current_user_saved_tracks_contains([track_id])
    return {"saved": bool(result and result[0])}

@mcp.tool()
def save_track(track_id: str) -> str:
    sp.current_user_saved_tracks_add([track_id])
    return "Track saved to Liked Songs"

@mcp.tool()
def remove_saved_track(track_id: str) -> str:
    sp.current_user_saved_tracks_delete([track_id])
    return "Track removed from Liked Songs"

@mcp.tool()
def add_track_to_playlist(playlist_id: str, track_uri: str) -> str:
    sp.playlist_add_items(playlist_id, [track_uri])
    return f"Added track to playlist {playlist_id}"

@mcp.tool()
def play_tracks(track_uris: list[str]) -> str:
    if not track_uris:
        return "No tracks provided."
    sp.start_playback(uris=track_uris)
    return f"Playing {len(track_uris)} track(s)"

@mcp.tool()
def play_album(album_name: str) -> str:
    results = sp.search(q=f"album:{album_name}", type="album")
    if results["albums"]["items"]:
        album_id = results["albums"]["items"][0]["id"]
        sp.start_playback(context_uri=f"spotify:album:{album_id}")
        return f"Playing album: {album_name}"
    return f"Album not found: {album_name}"

@mcp.tool()
def play_track(track_name: str) -> str:
    results = sp.search(q=f"track:{track_name}", type="track")
    if results["tracks"]["items"]:
        track = results["tracks"]["items"][0]
        sp.start_playback(uris=[track["uri"]])
        return f"Playing {track['name']} by {track['artists'][0]['name']}"
    return f"Track not found: {track_name}"


@mcp.tool()
def get_playlists() -> list[dict]:
    playlists = []
    result = sp.current_user_playlists(limit=50)
    while result:
        for p in result["items"]:
            if not p:
                continue
            track_count = (p.get("items") or p.get("tracks") or {}).get("total", 0)
            images = p.get("images") or []
            image_url = images[0]["url"] if images else None
            playlists.append({
                "id": p["id"],
                "name": p["name"],
                "track_count": track_count,
                "owner": (p.get("owner") or {}).get("display_name", "Unknown"),
                "public": p.get("public", False),
                "image": image_url,
            })
        result = sp.next(result) if result["next"] else None
    return playlists

@mcp.tool()
def get_playlist_tracks(playlist_id: str) -> list[dict]:
    tracks = []
    result = sp.playlist_items(playlist_id, limit=100)
    while result:
        for entry in result["items"]:
            t = entry.get("item") or entry.get("track")
            if not t or not t.get("uri"):
                continue
            if t.get("is_local") or t.get("type") == "episode":
                continue
            album = t.get("album") or {}
            album_images = album.get("images") or []
            thumb = album_images[-1]["url"] if album_images else None
            full_img = album_images[0]["url"] if album_images else None
            tracks.append({
                "uri": t["uri"],
                "id": t["id"],
                "name": t["name"],
                "artists": [a["name"] for a in t.get("artists", [])],
                "album": album.get("name", ""),
                "release_date": album.get("release_date", ""),
                "duration_ms": t.get("duration_ms", 0),
                "popularity": t.get("popularity"),
                "spotify_url": t.get("external_urls", {}).get("spotify", ""),
                "image": thumb,
                "image_full": full_img,
            })
        result = sp.next(result) if result["next"] else None
    return tracks

@mcp.tool()
def reorder_playlist_track(playlist_id: str, range_start: int, insert_before: int) -> str:
    sp.playlist_reorder_items(playlist_id, range_start=range_start, insert_before=insert_before)
    return f"Moved track at position {range_start} to before position {insert_before}"

@mcp.tool()
def save_playlist_order(playlist_id: str, track_uris: list[str]) -> str:
    if not track_uris:
        return "No tracks provided-> playlist not modified."
    sp.playlist_replace_items(playlist_id, track_uris[:100])
    for i in range(100, len(track_uris), 100):
        sp.playlist_add_items(playlist_id, track_uris[i:i + 100])
    return f"Saved {len(track_uris)} tracks to playlist {playlist_id}"

@mcp.tool()
def remove_tracks_from_playlist(playlist_id: str, track_uris: list[str]) -> str:
    if not track_uris:
        return "No URIs provided-> nothing removed."
    sp.playlist_remove_all_occurrences_of_items(playlist_id, track_uris)
    return f"Removed {len(track_uris)} track(s) from playlist {playlist_id}"

@mcp.tool()
def remove_duplicate_tracks(playlist_id: str) -> str:
    tracks = get_playlist_tracks(playlist_id)
    seen = set()
    unique_uris = []
    duplicates_removed = 0
    for t in tracks:
        if t["uri"] not in seen:
            seen.add(t["uri"])
            unique_uris.append(t["uri"])
        else:
            duplicates_removed += 1
    if duplicates_removed == 0:
        return "No duplicate tracks found."
    save_playlist_order(playlist_id, unique_uris)
    return f"Removed {duplicates_removed} duplicate(s). Playlist now has {len(unique_uris)} tracks."

@mcp.tool()
def sort_playlist(playlist_id: str, sort_by: str = "name", order: str = "asc") -> str:
    valid_fields = {"name", "artist", "album", "duration_ms", "release_date"}
    if sort_by == "popularity":
        return "Spotify no longer shares track popularity, so playlists can't be sorted by it."
    if sort_by not in valid_fields:
        return f"Invalid sort field '{sort_by}'. Choose from: {', '.join(valid_fields)}"
    if order not in {"asc", "desc"}:
        return "Invalid order. Use 'asc' or 'desc'."

    tracks = get_playlist_tracks(playlist_id)

    def sort_key(t):
        if sort_by == "name":
            return t["name"].lower()
        elif sort_by == "artist":
            return t["artists"][0].lower() if t["artists"] else ""
        elif sort_by == "album":
            return t["album"].lower()
        elif sort_by == "release_date":
            return t.get("release_date") or ""
        else:
            return t.get(sort_by, 0) or 0

    reverse = order == "desc"
    tracks.sort(key=sort_key, reverse=reverse)
    uris = [t["uri"] for t in tracks]
    save_playlist_order(playlist_id, uris)
    return f"Playlist sorted by {sort_by} ({order}) and saved. {len(uris)} tracks."

@mcp.tool()
def create_playlist_from_tracks(name: str, track_uris: list[str], public: bool = False, description: str = "", cover_image_url: str = "") -> str:
    playlist = sp.current_user_playlist_create(
        name,
        public=public,
        description=description or "Created with Spotify MCP",
    )
    if track_uris:
        for i in range(0, len(track_uris), 100):
            sp.playlist_add_items(playlist["id"], track_uris[i:i + 100])
    cover_note = ""
    if cover_image_url:
        try:
            img = requests.get(cover_image_url, timeout=10).content
            b64 = base64.b64encode(img).decode("ascii")
            sp.playlist_upload_cover_image(playlist["id"], b64)
            cover_note = " Cover image copied."
        except Exception as e:
            cover_note = f" Cover copy failed: {e}"
    return f"Created playlist '{name}' with {len(track_uris)} tracks.{cover_note} ID: {playlist['id']}"

@mcp.tool()
def get_track_genres(artist: str, track: str) -> list[str]:
    api_key = settings.LASTFM_API_KEY
    if not api_key:
        return ["LASTFM_API_KEY not set in environment"]
    url = (
        f"http://ws.audioscrobbler.com/2.0/?method=track.getInfo"
        f"&api_key={api_key}&artist={requests.utils.quote(artist)}"
        f"&track={requests.utils.quote(track)}&format=json"
    )
    try:
        resp = requests.get(url, timeout=5)
        data = resp.json()
        tags = data.get("track", {}).get("toptags", {}).get("tag", [])
        return [t["name"] for t in tags[:5]]
    except Exception as e:
        return [f"Error fetching genres: {e}"]

@mcp.tool()
def get_current_playback() -> dict:
    data = sp.current_playback()
    if not data or not data.get("item"):
        return {"playing": False, "track": None}
    item = data["item"]
    album = item.get("album", {})
    album_images = album.get("images", [])
    image_url = album_images[0]["url"] if album_images else None
    device = data.get("device") or {}
    return {
        "playing": data.get("is_playing", False),
        "track": item["name"],
        "id": item.get("id"),
        "uri": item.get("uri"),
        "artists": [a["name"] for a in item.get("artists", [])],
        "album": album.get("name", ""),
        "image": image_url,
        "progress_ms": data.get("progress_ms", 0),
        "duration_ms": item.get("duration_ms", 0),
        "spotify_url": item.get("external_urls", {}).get("spotify", ""),
        "repeat_state": data.get("repeat_state", "off"),
        "shuffle_state": data.get("shuffle_state", False),
        "volume_percent": device.get("volume_percent", 50),
    }

@mcp.tool()
def get_user_profile() -> dict:
    user = sp.current_user()
    if not user:
        return {"error": "Could not fetch user profile"}
    
    images = user.get("images") or []

    return {
        "display_name": user.get("display_name") or user.get("id"),
        "user_id": user.get("id"),
        "followers": user.get("followers", {}).get("total", 0),
        "images": images,
        "profile_url": user.get("external_urls", {}).get("spotify", ""),
        "email": user.get("email"),
        "country": user.get("country"),
    }


if __name__ == "__main__":
    try:
        transport = settings.TRANSPORT_PROTOCOL
        if transport == "stdio":
            logger.info("Starting MCP server with stdio transport...")
            mcp.run(transport="stdio")
        elif transport == "sse":
            logger.info("Starting MCP server with SSE transport...")
            mcp.run(transport="sse")
    except Exception as e:
        logger.error(f"Failed to start MCP server: {e}")
