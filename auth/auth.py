"""
auth/auth.py — Runtime OAuth credential loader for Gmail + Calendar APIs

Local dev: reads oauth_final.json (generated once by auth_setup.py).
Deployed: reads the same JSON from the OAUTH_CREDENTIALS env var (Secret
Manager, mounted via secretKeyRef) — the file is gitignored/dockerignored
on purpose (never commit real OAuth tokens), so it never exists in the
container; confirmed directly via a real "oauth_final.json not found"
production error before this env var fallback was added.

Auto-refreshes the access_token if expired. The refreshed token is only
persisted back to oauth_final.json when running from that file (local
dev convenience) — when sourced from OAUTH_CREDENTIALS there's nowhere
durable to write it back to (Cloud Run's filesystem is ephemeral, and a
mounted secret is read-only), but that's fine: the same refresh_token
keeps working across restarts, it just re-refreshes each time.
"""

import os
import json

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

OAUTH_FILE = os.path.join(os.path.dirname(__file__), "oauth_final.json")
OAUTH_CREDENTIALS_ENV_VAR = "OAUTH_CREDENTIALS"

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]
CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
]


def _load_oauth_data() -> tuple[dict, bool]:
    """Returns (oauth_data, loaded_from_file) — the second value controls
    whether a refreshed token gets persisted back to disk."""
    env_value = os.environ.get(OAUTH_CREDENTIALS_ENV_VAR)
    if env_value:
        return json.loads(env_value), False

    if not os.path.exists(OAUTH_FILE):
        raise FileNotFoundError(
            f"{OAUTH_FILE} not found and {OAUTH_CREDENTIALS_ENV_VAR} not set. "
            f"Run auth/auth_setup.py first to authorize."
        )
    with open(OAUTH_FILE, "r") as f:
        return json.load(f), True


def _save_oauth_data(data: dict) -> None:
    with open(OAUTH_FILE, "w") as f:
        json.dump(data, f, indent=2)


def _get_credentials(scopes: list[str]) -> Credentials:
    """
    Loads credentials from OAUTH_CREDENTIALS (deployed) or oauth_final.json
    (local dev), refreshing if expired, and persisting the refreshed
    access_token back to the file only in the local-dev case.
    """
    oauth_data, loaded_from_file = _load_oauth_data()

    creds = Credentials(
        token=oauth_data["access_token"],
        refresh_token=oauth_data["refresh_token"],
        token_uri=oauth_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=oauth_data["client_id"],
        client_secret=oauth_data["client_secret"],
        scopes=scopes,
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

        if loaded_from_file:
            # Persist refreshed token back to oauth_final.json
            oauth_data["access_token"] = creds.token
            _save_oauth_data(oauth_data)

    return creds


def build_gmail_service():
    creds = _get_credentials(GMAIL_SCOPES)
    return build("gmail", "v1", credentials=creds)


def build_calendar_service():
    creds = _get_credentials(CALENDAR_SCOPES)
    return build("calendar", "v3", credentials=creds)