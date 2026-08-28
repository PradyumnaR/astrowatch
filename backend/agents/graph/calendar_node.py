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
from app_guardrails.calendar_guardrails import (
    calendar_write_throttle,
    compute_dedupe_key,
    detect_prompt_injection,
    validate_selected_pass,
)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
PORT = os.getenv(
    "PORT", "8000"
)  # Render sets this at runtime; 8000 is just the local dev fallback
CALENDAR_MCP_URL = f"http://localhost:{PORT}/mcp/calendar"
CALENDAR_MCP_SERVICE_KEY = os.getenv("CALENDAR_MCP_SERVICE_KEY")

_supabase = get_supabase()


async def _get_valid_access_token(clerk_user_id: str) -> str | None:
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


async def _handle_tool_error(
    result, clerk_user_id: str, action_label: str
) -> dict | None:
    """
    Checks an MCP CallToolResult for an error. Returns a dict to
    return-early with if something went wrong, or None if the call
    succeeded and calendar_node should keep going.

    Centralizes the auth-revoked detection so it only needs to be
    correct in one place — both list_calendars and create_event share
    this same failure shape (a dead access_token), and any future tool
    call added to this file gets the same handling for free.
    """
    if not result.isError:
        return None

    error_text = "".join(c.text for c in result.content if isinstance(c, TextContent))

    if "401" in error_text or "invalid_token" in error_text.lower():
        _supabase.table("google_oauth_tokens").delete().eq(
            "clerk_user_id", clerk_user_id
        ).execute()
        return {
            "calendar_data": CalendarData(
                action="not_connected",
                summary="Google Calendar access was revoked. Please reconnect.",
            )
        }

    return {
        "calendar_data": CalendarData(
            action="error",
            summary=f"Calendar error during {action_label}: {error_text}",
        ),
        "errors": [f"calendar_node_error: {error_text}"],
    }


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

    # Guardrail 1 — reject an unsafe/implausible pass before any network
    # call is made at all. selected_pass is client-supplied (see
    # agents/models.py's ChatRequest), never re-verified against N2YO
    # here, so this is the only thing standing between a bad payload and
    # a real write to the user's calendar.
    violation = validate_selected_pass(selected_pass)
    if violation:
        return {
            "calendar_data": CalendarData(
                action="invalid", summary=violation.user_message
            ),
            "errors": [f"calendar_node_guardrail: {violation.code}"],
        }

    # Guardrail 2 — per-user write throttle. Checked before spending an
    # access-token refresh + list_calendars call on a request we're going
    # to refuse anyway.
    if not calendar_write_throttle.allow(clerk_user_id):
        return {
            "calendar_data": CalendarData(
                action="rate_limited",
                summary="You've added several calendar events recently — "
                "please wait a bit before adding more.",
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
                headers={"Authorization": f"Bearer {CALENDAR_MCP_SERVICE_KEY}"},  # NEW
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
            calendars_result = await session.call_tool(
                "list_calendars", {"access_token": access_token}  # was {} before
            )
            error = await _handle_tool_error(
                calendars_result, clerk_user_id, "list_calendars"
            )
            if error:
                return error
            calendars = (calendars_result.structuredContent or {}).get("calendars", [])

            writable = [
                c
                for c in calendars
                if c.get("accessRole") in ("owner", "writer") or c.get("primary")
            ] or calendars

            # NEW — check if the latest message is actually answering a
            # question we already asked, before treating multiple
            # calendars as still-ambiguous. Skipped when the message
            # looks like it's trying to manipulate the assistant rather
            # than genuinely name a calendar — substring-matching
            # arbitrary user text against calendar names is a reasonable
            # UX shortcut for normal replies, but not something to trust
            # when the message looks adversarial. Falling through to the
            # needs_confirmation branch below is always safe — worst
            # case it just asks again.
            matched = (
                None
                if detect_prompt_injection(latest_message)
                else next(
                    (c for c in writable if c.get("summary", "") in latest_message),
                    None,
                )
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

            # Guardrail 3 — idempotency. Computed from (user, satellite,
            # pass start time), so repeated turns for the exact same pass
            # (accidental double-submit, a retried request, a user just
            # saying "add it" twice) return the existing event instead of
            # creating a duplicate. See calendar_server.create_event.
            dedupe_key = compute_dedupe_key(
                clerk_user_id, selected_pass.satid, selected_pass.startUTC
            )

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
                    "dedupe_key": dedupe_key,
                },
            )

            error = await _handle_tool_error(
                event_result, clerk_user_id, "create_event"
            )
            if error:
                return error
            event = event_result.structuredContent or {}
            already_existed = bool(event.get("already_existed"))

            return {
                "calendar_data": CalendarData(
                    action="created",
                    event_link=event.get("htmlLink"),
                    already_existed=already_existed,
                    summary=(
                        f"{selected_pass.satname} pass was already on the calendar."
                        if already_existed
                        else f"Added {selected_pass.satname} pass to calendar."
                    ),
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
