import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / '.env')


class Settings:
    SPOTIFY_CLIENT_ID: str = os.environ.get("SPOTIFY_CLIENT_ID", "")
    SPOTIFY_CLIENT_SECRET: str = os.environ.get("SPOTIFY_CLIENT_SECRET", "")
    MCP_REDIRECT_URI: str = os.environ.get("MCP_REDIRECT_URI", "http://127.0.0.1:8080/callback")
    LASTFM_API_KEY: str = os.environ.get("LASTFM_API_KEY", "")
    TRANSPORT_PROTOCOL: str = os.environ.get("TRANSPORT_PROTOCOL", "stdio")


settings = Settings()
