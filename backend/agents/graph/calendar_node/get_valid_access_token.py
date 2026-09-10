import os
from rag.database import get_supabase
from typing import cast
from datetime import datetime, timedelta, timezone
import httpx

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


_supabase = get_supabase()


async def get_valid_access_token(clerk_user_id: str) -> str | None:
    """Looks up stored Google tokens, refreshing via refresh_token if the
    access_token is expired or close to it."""
    result = (
        _supabase.table("google_oauth_tokens")
        .select("*")
        .eq("clerk_user_id", clerk_user_id)
        .maybe_single()
        .execute()
    )
    row = cast(dict, result.data) if result else None
    if not row:
        return None

    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if expires_at > datetime.now(timezone.utc) + timedelta(minutes=2):
        return row["access_token"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": row["refresh_token"],
                "grant_type": "refresh_token",
            },
        )

    if resp.status_code == 400:
        # Refresh token is dead — almost always because the user revoked
        # access. Clean up the now-useless row so /api/calendar/status
        # correctly reports "not connected" too, and return None so
        # calendar_node's existing not_connected path handles this
        # gracefully instead of the exception propagating uncaught.
        _supabase.table("google_oauth_tokens").delete().eq(
            "clerk_user_id", clerk_user_id
        ).execute()
        return None

    resp.raise_for_status()  # any OTHER failure here is genuinely unexpected
    tokens = resp.json()

    new_expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
    ).isoformat()

    _supabase.table("google_oauth_tokens").update(
        {"access_token": tokens["access_token"], "expires_at": new_expires_at}
    ).eq("clerk_user_id", clerk_user_id).execute()

    return tokens["access_token"]
