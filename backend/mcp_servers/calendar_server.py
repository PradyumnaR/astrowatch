"""
astrowatch-calendar — internal MCP server wrapping Google's standard,
stable Calendar REST API v3 directly.

This exists as a workaround for Google's own Calendar MCP server
(calendarmcp.googleapis.com), which returns "the caller does not have
permission" consistently — even for read-only calls, with fully correct
scopes and project setup — strongly suggesting it's gated to Google
Workspace-managed accounts rather than personal Gmail accounts. See
the debugging trail for how that was ruled down to this conclusion.

Unlike satellite_server.py/weather_server.py/knowledge_server.py, this
server is NOT part of the public Developer Portal surface — it has no
bearer-key auth of its own, since it's only ever called by our own
calendar_node.py in the same trusted backend. Each tool instead takes
the caller's Google access_token directly as a parameter.
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated

import httpx
from fastmcp import FastMCP
from pydantic import Field
from mcp_servers.auth import (
    InMemoryRateLimiter,
    RateLimitMiddleware,
    SupabaseAPIKeyVerifier,
)

CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"

auth = SupabaseAPIKeyVerifier(server_name="calendar")
mcp = FastMCP(name="astrowatch-calendar", auth=auth)
mcp.add_middleware(
    RateLimitMiddleware(InMemoryRateLimiter(max_calls=30, window_seconds=60))
)


@mcp.tool()
async def list_calendars(
    access_token: Annotated[
        str, Field(description="A valid Google OAuth access token")
    ],
) -> dict:
    """List the user's Google calendars, with accessRole and primary flag."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{CALENDAR_API_BASE}/users/me/calendarList",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

    return {
        "calendars": [
            {
                "id": item.get("id"),
                "summary": item.get("summary"),
                "accessRole": item.get("accessRole"),
                "primary": item.get("primary", False),
            }
            for item in data.get("items", [])
        ]
    }


DEDUPE_PROPERTY_NAME = "astrowatch_dedupe_key"


async def _find_event_by_dedupe_key(
    client, access_token, calendar_id, dedupe_key
) -> dict | None:
    response = await client.get(
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "privateExtendedProperty": f"{DEDUPE_PROPERTY_NAME}={dedupe_key}",
            "maxResults": 1,
        },
        timeout=15,
    )
    response.raise_for_status()
    items = response.json().get("items", [])
    return items[0] if items else None


# ±10 min — pass predictions can shift a little between two separate
# fetches of "the same" pass (satname's dedupe_key is hashed from
# clerk_user_id + satid + start_utc, so any drift in start_utc since the
# event was created produces a completely different key). This tolerates
# that drift for delete/update's lookup without changing create_event's
# own idempotency check, which must stay exact — a different start time
# there could genuinely be a different, legitimate new pass.
FALLBACK_MATCH_WINDOW_SECONDS = 600


async def _find_astrowatch_event_fallback(
    client, access_token, calendar_id, satname, start_utc
) -> dict | None:
    """
    Fallback lookup for delete/update when the exact dedupe_key doesn't
    match anything. Still only ever matches an event AstroWatch itself
    created: every candidate must both (a) have the summary AstroWatch
    always sets ("{satname} pass") and (b) carry SOME
    astrowatch_dedupe_key extended property, regardless of its value —
    so this can never touch a personal event that happens to have a
    similar title or time, only ever a genuine AstroWatch invite whose
    exact key just doesn't match anymore.
    """
    start_dt = datetime.fromtimestamp(start_utc, tz=timezone.utc)
    window = timedelta(seconds=FALLBACK_MATCH_WINDOW_SECONDS)

    response = await client.get(
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": (start_dt - window).isoformat(),
            "timeMax": (start_dt + window).isoformat(),
            "singleEvents": "true",
            "q": satname,
        },
        timeout=15,
    )
    response.raise_for_status()

    expected_summary = f"{satname} pass"
    for item in response.json().get("items", []):
        if item.get("summary") != expected_summary:
            continue
        if item.get("extendedProperties", {}).get("private", {}).get(DEDUPE_PROPERTY_NAME):
            return item
    return None


async def _find_event_to_modify(
    client, access_token, calendar_id, dedupe_key, satname, start_utc
) -> dict | None:
    """Exact dedupe_key match first (cheap, precise); only falls back to
    the time/name search above if that misses."""
    existing = await _find_event_by_dedupe_key(
        client, access_token, calendar_id, dedupe_key
    )
    if existing:
        return existing
    return await _find_astrowatch_event_fallback(
        client, access_token, calendar_id, satname, start_utc
    )


@mcp.tool()
async def create_event(
    access_token: str,
    calendar_id: str,
    summary: str,
    description: str,
    start_time: str,
    end_time: str,
    reminder_minutes: int = 10,
    dedupe_key: Annotated[
        str | None,
        Field(
            description="Opaque idempotency key. If an event already carries "
            "this key, it's returned instead of creating a duplicate."
        ),
    ] = None,
) -> dict:
    async with httpx.AsyncClient() as client:
        if dedupe_key:
            existing = await _find_event_by_dedupe_key(
                client, access_token, calendar_id, dedupe_key
            )
            if existing:
                return {
                    "htmlLink": existing.get("htmlLink"),
                    "id": existing.get("id"),
                    "status": existing.get("status"),
                    "already_existed": True,
                }

        body = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start_time},
            "end": {"dateTime": end_time},
            "reminders": {
                "useDefault": False,
                "overrides": [{"method": "popup", "minutes": reminder_minutes}],
            },
        }
        if dedupe_key:
            body["extendedProperties"] = {"private": {DEDUPE_PROPERTY_NAME: dedupe_key}}

        response = await client.post(
            f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
            timeout=15,
        )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Google Calendar API error {response.status_code}: {response.text}"
        )

    event = response.json()
    return {
        "htmlLink": event.get("htmlLink"),
        "id": event.get("id"),
        "status": event.get("status"),
        "already_existed": False,
    }


@mcp.tool()
async def delete_event(
    access_token: Annotated[
        str, Field(description="A valid Google OAuth access token")
    ],
    calendar_id: str,
    dedupe_key: Annotated[
        str,
        Field(
            description="Opaque idempotency key that identifies the "
            "AstroWatch-created event to delete."
        ),
    ],
    satname: Annotated[
        str,
        Field(
            description="Satellite name — used only as a fallback lookup "
            "if the exact dedupe_key doesn't match anything (e.g. the "
            "pass's predicted time shifted slightly since the invite was "
            "created)."
        ),
    ],
    start_utc: Annotated[
        int,
        Field(
            description="The pass's current predicted start time (unix "
            "seconds) — the time window for the fallback lookup."
        ),
    ],
) -> dict:
    """
    Deletes the AstroWatch-created event on this calendar matching
    dedupe_key (or, failing that, the satname+start_utc fallback), if one
    exists. Never accepts a raw event id — every candidate is required to
    carry AstroWatch's own dedupe extended property (see
    _find_event_to_modify), so this can only ever remove an event
    AstroWatch itself created, not an arbitrary event on the user's
    calendar.
    """
    async with httpx.AsyncClient() as client:
        existing = await _find_event_to_modify(
            client, access_token, calendar_id, dedupe_key, satname, start_utc
        )
        if not existing:
            return {"deleted": False, "reason": "not_found"}

        response = await client.delete(
            f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events/{existing['id']}",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )

    # Google returns 410 Gone if the event was already deleted elsewhere
    # (e.g. by the user, directly in Google Calendar) between our lookup
    # and this call — treat that the same as a successful delete.
    if response.status_code >= 400 and response.status_code != 410:
        raise RuntimeError(
            f"Google Calendar API error {response.status_code}: {response.text}"
        )

    return {"deleted": True, "id": existing["id"]}


@mcp.tool()
async def update_event(
    access_token: Annotated[
        str, Field(description="A valid Google OAuth access token")
    ],
    calendar_id: str,
    dedupe_key: Annotated[
        str,
        Field(
            description="Opaque idempotency key that identifies the "
            "AstroWatch-created event to update."
        ),
    ],
    reminder_minutes: Annotated[
        int, Field(description="New reminder lead time, in minutes before "
        "the event starts.")
    ],
    satname: Annotated[
        str,
        Field(
            description="Satellite name — used only as a fallback lookup "
            "if the exact dedupe_key doesn't match anything (e.g. the "
            "pass's predicted time shifted slightly since the invite was "
            "created)."
        ),
    ],
    start_utc: Annotated[
        int,
        Field(
            description="The pass's current predicted start time (unix "
            "seconds) — the time window for the fallback lookup."
        ),
    ],
) -> dict:
    """
    Updates the reminder on the AstroWatch-created event on this calendar
    matching dedupe_key (or, failing that, the satname+start_utc
    fallback), if one exists. Same fallback-aware lookup as delete_event
    — never accepts a raw event id.
    """
    async with httpx.AsyncClient() as client:
        existing = await _find_event_to_modify(
            client, access_token, calendar_id, dedupe_key, satname, start_utc
        )
        if not existing:
            return {"updated": False, "reason": "not_found"}

        response = await client.patch(
            f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events/{existing['id']}",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "reminders": {
                    "useDefault": False,
                    "overrides": [
                        {"method": "popup", "minutes": reminder_minutes}
                    ],
                }
            },
            timeout=15,
        )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Google Calendar API error {response.status_code}: {response.text}"
        )

    event = response.json()
    return {
        "updated": True,
        "htmlLink": event.get("htmlLink"),
        "id": event.get("id"),
        "reminder_minutes": reminder_minutes,
    }


if __name__ == "__main__":
    mcp.run()
