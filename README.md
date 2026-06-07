<div align="center">

# SpotifyDashTool

**A web app and MCP server for sorting, managing, and reordering your Spotify playlists - with drag-and-drop, genre tagging via Last.fm, and full playback control.**

[![Node.js](https://img.shields.io/badge/node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/python-3.12+-blue?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Spotify](https://img.shields.io/badge/Spotify-API-1DB954?style=flat-square&logo=spotify&logoColor=white)](https://developer.spotify.com/)
[![Last.fm](https://img.shields.io/badge/Last.fm-API-D51007?style=flat-square&logo=last.fm&logoColor=white)](https://www.last.fm/api)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

## How it works

The project has three parts that work together:

- **`mcp/`** - A Python [MCP](https://modelcontextprotocol.io) server that handles all Spotify communication using `spotipy`. This is where credentials live and all API calls are made.
- **`backend/`** - A Node.js/Express server that serves the frontend and bridges HTTP requests from the browser to the MCP server over stdio.
- **`public/`** - The web frontend. Drag-and-drop playlist manager, genre tagging, sorting, and playback status.

The MCP server can also be used standalone with any MCP-compatible client (Claude Desktop, Cursor, or a Python script).

> [!IMPORTANT]
> **Dual-auth model.** There are two independent Spotify auth paths, and they must be the **same account**:
> 1. **Browser OAuth** (PKCE) - used only for the frontend's direct read calls (`/api/playlists`, `/api/tracks`, `/api/audio-features`) and as the app's login gate.
> 2. **MCP server (spotipy)** - authenticates itself from the shared root `.env` and its own `mcp/.spotipyoauthcache`; this is what actually performs every playlist/playback/library action.
>
> The frontend no longer passes its browser token into MCP calls (the MCP server ignored it). Both paths read the same `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` from the single root `.env`, so point both at the one account.

> [!NOTE]
> Spotify restricted their Web API in February/March 2026. Apps in Development Mode are limited to **25 manually allowlisted accounts**. You must add your own Spotify account to your app's allowlist in the [Developer Dashboard](https://developer.spotify.com/dashboard) before this will work.

---

## Requirements

- Node.js 18+
- Python 3.12+
- [`uv`](https://github.com/astral-sh/uv) - Python package manager
- A [Spotify Developer app](https://developer.spotify.com/dashboard)
- A Spotify Premium account (required by Spotify for playback control)
- A [Last.fm API key](https://www.last.fm/api/account/create) (optional - for genre tagging)

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/drew-codes-things/SpotifySortTool.git
cd SpotifySortTool
```

### 2. Configure environment

Both the backend and MCP server share a single `.env` file in the repo root.

```bash
cp .env.example .env
```

Edit `.env`:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# OAuth callback for the backend web server (port 4000)
BACKEND_REDIRECT_URI=http://127.0.0.1:4000/callback

# OAuth callback for the MCP server's internal listener (port 8080)
MCP_REDIRECT_URI=http://127.0.0.1:8080/callback

LASTFM_API_KEY=your_lastfm_api_key
TRANSPORT_PROTOCOL=stdio
```

### 3. Install dependencies

```bash
# Backend
cd backend && npm install && cd ..

# MCP server
cd mcp && pip install uv && uv sync && cd ..
```

### 4. Spotify Developer Dashboard

In your app settings at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard):

- Add `http://127.0.0.1:4000/callback` as a Redirect URI (backend)
- Add `http://127.0.0.1:8080/callback` as a Redirect URI (MCP server)
- Add your Spotify account to the allowlist under **User Management**

> [!NOTE]
> The MCP server requests these scopes: `playlist-read-private`,
> `playlist-modify-public`, `playlist-modify-private`, `user-read-private`,
> `user-read-playback-state`, `user-modify-playback-state`, `user-library-read`,
> `user-library-modify`. If you change scopes later, delete
> `mcp/.spotipyoauthcache` and re-authorize so the new permissions take effect.

---

## Usage

### Web app

```bash
cd backend
node index.js
```

Open `http://127.0.0.1:4000` in your browser. The backend automatically spawns the MCP server as a subprocess - you don't need to start it separately.

On first run, a browser window will open for Spotify OAuth. After authenticating, the token is cached and future runs are headless.

Click **Connect Spotify** in the UI to log in, then select a playlist to get started.

### MCP server standalone

The MCP server is managed by [`uv`](https://github.com/astral-sh/uv) - it is **required** (it reads `mcp/pyproject.toml` to resolve dependencies and provides the `uv run` launcher used both standalone and by the backend bridge). Install it with `pip install uv` (or the official installer) before running:

```bash
cd mcp
uv run python server.py
```

Use this if you want to call the MCP tools directly from a Python script or an MCP-compatible client without the web interface.

---

## Web App Features

The UI is a three-column layout: **user profile** (left), **playlists + track editor** (center), and a live **Now Playing** panel (right).

### Playlists & track editor
- **Drag & drop** reordering of tracks within a playlist
- **Multi-criteria sorting** by name, artist, album, duration, or popularity (ascending/descending)
- **Smart Sort (auto-DJ)** - reorder for *flow*, not just alphabetically:
  - **Flow** - greedy nearest-neighbour on track energy for smooth transitions
  - **Build-up** - energy ramps up across the playlist
  - **Group by genre** - clusters by Last.fm genre, biggest groups first

  Flow/Build-up use Spotify's audio-features; if unavailable for your app they
  fall back to genre grouping.
- **Undo / Redo** - every reorder, sort, shuffle, or removal is reversible
  (buttons or `Ctrl/Cmd+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`); history resets per playlist
- **Random shuffle** of the current playlist
- **Filter** tracks by name or artist
- **Remove** individual tracks or batch-remove with checkboxes
- **Remove duplicates** based on track URI
- **Unsaved-changes indicator** - moved rows are highlighted and a badge shows a
  live count (e.g. `- Unsaved - 3 moved - 1 removed`); **Discard** reverts to the
  last saved order
- **Diff-aware save** - "Save Changes" compares against the saved order and does
  the least work: nothing if unchanged, a batched **remove** for pure deletions
  (preserves track attribution), or a full rewrite only when tracks were reordered
- **Save as new playlist** - keep the original and save a copy
- **Genre tagging** - genre suggestions per track via Last.fm, shown as pill badges
- **Genre Stats** - genre frequency breakdown for the loaded playlist (samples the first 50 tracks)
- **Hidden playlists** - `My Shazam Tracks` is hidden by default; edit `HIDDEN_PLAYLISTS` in `public/script.js` to hide others

### Now Playing panel
- Live album art, track, artist, album, and genre tags - **auto-refreshes every 10 seconds**
- Controls: previous / play-pause / next / **skip ahead 15s**
- **Click the progress bar to seek**
- **Shuffle** toggle and **repeat** cycle (off - playlist - track)
- **Volume** slider
- **Like** - save or remove the current track from your Liked Songs
- **Add** - add the current track to any of your playlists
- **Up Next queue** - drag to reorder, or click any track to "play from here"

---

## MCP Tools

The MCP server exposes the following tools, usable from any MCP client or the web app via the backend bridge.

**Playlists**

| Tool | Description |
|---|---|
| `get_playlists()` | List all your playlists |
| `get_playlist_tracks(playlist_id)` | Get all tracks in a playlist |
| `sort_playlist(playlist_id, sort_by, order)` | Sort by name / artist / album / duration_ms / popularity / release_date |
| `reorder_playlist_track(playlist_id, range_start, insert_before)` | Move a single track by index |
| `save_playlist_order(playlist_id, track_uris)` | Overwrite playlist with a new URI order |
| `remove_tracks_from_playlist(playlist_id, track_uris)` | Remove specific tracks |
| `remove_duplicate_tracks(playlist_id)` | Remove duplicates, keep first occurrence |
| `create_playlist_from_tracks(name, track_uris)` | Save current order as a new playlist |
| `add_track_to_playlist(playlist_id, track_uri)` | Add a single track to a playlist |

**Playback**

| Tool | Description |
|---|---|
| `get_current_playback()` | Now playing info (track, image, progress, volume, shuffle/repeat state) |
| `play()` / `pause()` | Resume or pause playback |
| `next_track()` / `previous_track()` | Skip tracks |
| `seek(position_ms)` | Seek within the current track |
| `set_shuffle(enabled)` | Enable or disable shuffle |
| `repeat()` / `repeat_track()` / `repeat_off()` | Repeat context / track / off |
| `set_volume(volume_percent)` | Set volume (0-100) |
| `get_queue()` | Get the upcoming playback queue |
| `play_tracks(track_uris)` | Start playback from an explicit ordered list (powers "play from here") |
| `play_track(track_name)` | Search and play a track by name |
| `play_album(album_name)` | Search and play an album by name |

**Library**

| Tool | Description |
|---|---|
| `is_track_saved(track_id)` | Whether a track is in Liked Songs (`{ saved: bool }`) |
| `save_track(track_id)` | Add a track to Liked Songs |
| `remove_saved_track(track_id)` | Remove a track from Liked Songs |

**Other**

| Tool | Description |
|---|---|
| `get_track_genres(artist, track)` | Fetch Last.fm genre tags for a track |
| `get_user_profile()` | Current user's profile info |

---

## Using with Claude Desktop / Cursor

Add this block to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "spotify-sort-tool": {
      "command": "/path/to/SpotifySortTool/mcp/.venv/bin/python",
      "args": ["/path/to/SpotifySortTool/mcp/server.py"],
      "transport": "stdio",
      "env": {
        "SPOTIFY_CLIENT_ID": "your_client_id",
        "SPOTIFY_CLIENT_SECRET": "your_client_secret",
        "MCP_REDIRECT_URI": "http://127.0.0.1:8080/callback",
        "LASTFM_API_KEY": "your_lastfm_key",
        "TRANSPORT_PROTOCOL": "stdio"
      }
    }
  }
}
```

---

## Using from a Python script

```python
import asyncio, os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

server_params = StdioServerParameters(
    command="uv",
    args=["--directory", "/path/to/SpotifySortTool/mcp", "run", "python", "server.py"],
    env={**os.environ},
)

async def main():
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(
                "sort_playlist",
                arguments={"playlist_id": "YOUR_PLAYLIST_ID", "sort_by": "artist", "order": "asc"}
            )
            print(result)

asyncio.run(main())
```

---

## File Structure

```
SpotifySortTool/
  .env.example         Shared credential template (copy to .env in repo root)
  mcp/
    server.py          MCP server - all Spotify tools
    config.py          spotipy auth setup
    settings.py        dotenv config loader
    pyproject.toml     Python dependencies
  backend/
    index.js           Express server + /api/mcp/:tool bridge endpoint
    mcp-bridge.js      Spawns MCP server over stdio, speaks JSON-RPC
    package.json       Node dependencies
  public/
    index.html         Web UI
    script.js          Frontend logic - all Spotify calls go via /api/mcp/:tool
```

---

## Backend API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/config` | Returns Spotify Client ID, Redirect URI, Last.fm key |
| `POST` | `/api/token` | Exchanges Spotify auth code for an access token |
| `POST` | `/api/refresh` | Refreshes an expired access token |
| `GET` | `/api/playlists` | Lists playlists directly from Spotify (accurate track counts + images) |
| `GET` | `/api/tracks/:trackId` | Fetches a single track's details from Spotify |
| `GET` | `/api/audio-features` | Batched audio-features (tempo/energy) for Smart Sort; may 403 on newer apps |
| `GET` | `/api/genres` | Fetches genre tags from Last.fm (falls back to direct HTTP if MCP fails) |
| `POST` | `/api/mcp/:tool` | Calls any MCP tool by name with `{ args: { ... } }` in the body |

---

## License

GPL-3.0 - made by [Drew](https://github.com/drew-codes-things)
