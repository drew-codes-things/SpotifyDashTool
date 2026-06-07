import os
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

import spotipy
from pathlib import Path
from dotenv import load_dotenv
from spotipy.oauth2 import SpotifyOAuth

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / '.env')

SCOPE = (
    "playlist-read-private "
    "playlist-modify-public "
    "playlist-modify-private "
    "user-read-private "
    "user-read-playback-state "
    "user-modify-playback-state "
    "user-library-read "
    "user-library-modify "
    "ugc-image-upload"
)

REDIRECT_URI = os.environ.get("MCP_REDIRECT_URI", "http://127.0.0.1:8080/callback")

_auth_manager = SpotifyOAuth(
    client_id=os.environ["SPOTIFY_CLIENT_ID"],
    client_secret=os.environ["SPOTIFY_CLIENT_SECRET"],
    redirect_uri=REDIRECT_URI,
    scope=SCOPE,
    cache_path=".spotipyoauthcache",
    open_browser=False,
)

def _do_oauth():
    """If no cached token exists, spin up a local HTTP server to catch the
    Spotify callback automatically instead of requiring a manual URL paste.
    
    Note: webbrowser.open() is NOT called - this fails in headless/SSH environments.
    If running in such an environment, manually visit the auth_url printed to console.
    When using this server via the Node.js backend, the backend handles OAuth.
    """
    if _auth_manager.get_cached_token():
        return

    parsed = urlparse(REDIRECT_URI)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 8080
    code_holder = {}

    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            qs = parse_qs(urlparse(self.path).query)
            if "code" in qs:
                code_holder["code"] = qs["code"][0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"<h2>Authorised! You can close this tab.</h2>")

        def log_message(self, *args):
            pass

    server = HTTPServer((host, port), _Handler)
    server.timeout = 120

    auth_url = _auth_manager.get_authorize_url()
    print(f"\n[MCP Auth Required] Paste this URL in your browser:\n{auth_url}\n")

    try:
        webbrowser.open(auth_url)
    except Exception as e:
        print(f"[MCP] Could not auto-open browser ({e}). Waiting for manual authorization...")

    while "code" not in code_holder:
        server.handle_request()

    server.server_close()
    _auth_manager.get_access_token(code_holder["code"], as_dict=False, check_cache=False)


_do_oauth()

sp = spotipy.Spotify(auth_manager=_auth_manager)
