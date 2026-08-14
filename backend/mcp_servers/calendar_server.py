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
mcp = FastMCP(
    name="astrowatch-calendar", auth=auth
)  # was: FastMCP(name="astrowatch-calendar") — no auth
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


@mcp.tool()
async def create_event(
    access_token: str,
    calendar_id: str,
    summary: str,
    description: str,
    start_time: str,
    end_time: str,
    reminder_minutes: int = 10,
) -> dict:
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

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
            timeout=15,
        )

    if response.status_code >= 400:
        # NEW — surface Google's actual reason instead of a generic 403
        raise RuntimeError(
            f"Google Calendar API error {response.status_code}: {response.text}"
        )

    event = response.json()
    return {
        "htmlLink": event.get("htmlLink"),
        "id": event.get("id"),
        "status": event.get("status"),
    }


if __name__ == "__main__":
    mcp.run()
