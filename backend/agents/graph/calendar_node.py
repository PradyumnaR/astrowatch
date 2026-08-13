"""
Calendar Agent node — adds the currently selected satellite pass to the
user's Google Calendar via Google's official Calendar MCP server
(calendarmcp.googleapis.com).

Unlike satellite/weather/knowledge nodes, this one can WRITE to an
external system, so it deliberately does not guess when something's
ambiguous (which calendar to use) — it returns needs_confirmation and
lets chat_v2.py surface that as an elicitation event instead.
"""

import os
import traceback
from datetime import datetime, timedelta, timezone
from typing import cast
from mcp.types import TextContent

import httpx
from langchain_mcp_adapters.client import MultiServerMCPClient
from agents.graph.state import AgentState, CalendarData
from rag.database import get_supabase
from langchain_mcp_adapters.sessions import Connection, StreamableHttpConnection


GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
PORT = os.getenv(
    "PORT", "8000"
)  # Render sets this at runtime; 8000 is just the local dev fallback
CALENDAR_MCP_URL = f"http://localhost:{PORT}/mcp/calendar"


async def _get_valid_access_token(clerk_user_id: str) -> str | None:
    """Looks up stored Google tokens, refreshing via refresh_token if the
    access_token is expired or close to it."""
    _supabase = get_supabase()
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
        resp.raise_for_status()
        tokens = resp.json()

    new_expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
    ).isoformat()

    _supabase.table("google_oauth_tokens").update(
        {"access_token": tokens["access_token"], "expires_at": new_expires_at}
    ).eq("clerk_user_id", clerk_user_id).execute()

    return tokens["access_token"]


async def calendar_node(state: AgentState) -> dict:
    clerk_user_id = state.get("clerk_user_id")
    selected_pass = state.get("selected_pass")
    messages = state.get("messages", [])
    latest_message = messages[-1].content if messages else ""

    if not clerk_user_id:
        return {
            "calendar_data": CalendarData(
                action="error", summary="No user identity on this request."
            ),
            "errors": ["calendar_node_error: missing clerk_user_id"],
        }

    if selected_pass is None:
        return {
            "calendar_data": CalendarData(
                action="error",
                summary="No satellite pass is currently selected to add.",
            )
        }

    access_token = await _get_valid_access_token(clerk_user_id)
    if access_token is None:
        return {
            "calendar_data": CalendarData(
                action="not_connected",
                summary="Google Calendar isn't connected yet.",
            )
        }

    try:
        connections: dict[str, Connection] = {
            "calendar": StreamableHttpConnection(
                transport="streamable_http",
                url=CALENDAR_MCP_URL,
            )
        }
        client = MultiServerMCPClient(connections)
        async with client.session("calendar") as session:
            # Step 1 — ambiguity check: does the user have more than one
            # writable calendar? NOTE: field names below (accessRole,
            # primary, summary) are the standard Google Calendar API v3
            # CalendarList shape — worth confirming against a real
            # list_calendars response the first time this runs, same as
            # every other MCP tool wrapper we've built this week.
            # tools_result = await session.list_tools()
            # print("Available tools for this token:")
            # for tool in tools_result.tools:
            #     print(f"  - {tool.name}: {tool.description}")
            calendars_result = await session.call_tool(
                "list_calendars", {"access_token": access_token}  # was {} before
            )
            calendars = (calendars_result.structuredContent or {}).get("calendars", [])

            print("calendars_result =>", calendars_result)

            writable = [
                c
                for c in calendars
                if c.get("accessRole") in ("owner", "writer") or c.get("primary")
            ] or calendars

            # NEW — check if the latest message is actually answering a
            # question we already asked, before treating multiple
            # calendars as still-ambiguous
            matched = next(
                (c for c in writable if c.get("summary", "") in latest_message),
                None,
            )
            if matched:
                calendar_id = matched["id"]
            elif len(writable) > 1:
                return {
                    "calendar_data": CalendarData(
                        action="needs_confirmation",
                        summary="Multiple calendars found.",
                        calendar_options=[
                            {
                                "label": c.get("summary", c.get("id", "Unnamed")),
                                "value": c.get("id"),
                            }
                            for c in writable
                        ],
                    )
                }
            else:
                calendar_id = writable[0]["id"] if writable else "primary"

            # Step 2 — create the event
            start_iso = datetime.fromtimestamp(
                selected_pass.startUTC, tz=timezone.utc
            ).isoformat()
            end_iso = datetime.fromtimestamp(
                selected_pass.endUTC, tz=timezone.utc
            ).isoformat()

            event_result = await session.call_tool(
                "create_event",
                {
                    "access_token": access_token,  # NEW
                    "calendar_id": calendar_id,
                    "summary": f"{selected_pass.satname} pass",
                    "description": f"Visible satellite pass — max elevation {selected_pass.maxEl}°",
                    "start_time": start_iso,
                    "end_time": end_iso,
                    "reminder_minutes": 10,
                },
            )

            print("create_event =>", event_result)

            if event_result.isError:
                error_text = "".join(
                    c.text for c in event_result.content if isinstance(c, TextContent)
                )
                return {
                    "calendar_data": CalendarData(
                        action="error", summary=f"Calendar error: {error_text}"
                    ),
                    "errors": [f"calendar_node_error: {error_text}"],
                }
            event = event_result.structuredContent or {}

            return {
                "calendar_data": CalendarData(
                    action="created",
                    event_link=event.get("htmlLink"),
                    summary=f"Added {selected_pass.satname} pass to calendar.",
                ),
                "tools_used": ["google_calendar"],
            }

    except Exception as e:
        traceback.print_exc()
        return {
            "calendar_data": CalendarData(
                action="error", summary=f"Calendar error: {e}"
            ),
            "errors": [f"calendar_node_error: {e}"],
        }
