"""
Calendar Agent node — adds, deletes, or updates a Google Calendar invite
for the currently selected satellite pass, via our own internal MCP server
wrapping the Calendar REST API (see mcp_servers/calendar_server.py).

Which action to take is decided by a cheap LLM tool-calling classifier
(Haiku, see _classify_calendar_action below) reading the user's message —
this node used to only ever create an event; it now also supports
deleting/updating an event AstroWatch itself previously created. It can
never touch a personal event the user created themselves: delete/update
only ever look an event up by the deterministic astrowatch_dedupe_key
private property (compute_dedupe_key), never by a raw event id supplied
by the model or the user.

Deletes and updates are real writes, so they always go through an
explicit yes/no confirmation turn first (CalendarData.action ==
"needs_confirmation", confirmation_kind == "delete"/"update"), surfaced by
chat_v2.py as an elicitation event. The confirmation loop is re-derived
from conversation history each turn rather than persisted state — same
approach orchestrator_node uses to resolve multi-turn references.

Unlike satellite/weather/knowledge nodes, this one can WRITE to an
external system, so it deliberately does not guess when something's
ambiguous (which calendar to use) — it returns needs_confirmation and
lets chat_v2.py surface that as an elicitation event instead.
"""

import os
import traceback
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional, cast
from mcp.types import TextContent

import httpx
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from pydantic import BaseModel, Field
from agents.graph.state import AgentState, CalendarData
from rag.database import get_supabase
from langchain_mcp_adapters.sessions import Connection, StreamableHttpConnection
from app_guardrails.calendar_guardrails import (
    calendar_write_throttle,
    compute_dedupe_key,
    detect_prompt_injection,
    validate_reminder_minutes,
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


# ── action classification — real Anthropic tool-calling, cheap model ────
#
# The orchestrator already decided "this turn needs the calendar agent" —
# this classifier decides WHICH calendar action, using genuine multi-tool
# calling (bind_tools + tool_calls, the same mechanism as the Anthropic
# SDK's native tool use) rather than a single with_structured_output call,
# since there are several genuinely distinct actions to pick from.

CALENDAR_ACTION_MODEL = "claude-haiku-4-5-20251001"  # cheap/fast classifier,
# same choice orchestrator_node.py makes for the same reason: this is a
# low-stakes routing decision, not the user-facing generation.


class CreatePassInvite(BaseModel):
    """Add the currently selected satellite pass to the user's calendar.
    Use this for a fresh "add/save/schedule/remind me about this pass"
    request."""


class DeletePassInvite(BaseModel):
    """Remove the AstroWatch calendar invite previously created for the
    currently selected pass. Use this for a FRESH "delete/remove/cancel
    this from my calendar" request — never for a yes/no reply to a
    confirmation question, see ConfirmPendingCalendarAction instead."""


class UpdatePassInviteReminder(BaseModel):
    """Change the reminder lead time on the AstroWatch calendar invite for
    the currently selected pass. Use this for a FRESH "notify/remind me N
    minutes before" request — never for a yes/no reply to a confirmation
    question."""

    reminder_minutes: int = Field(
        description="Minutes before the pass starts to send the reminder, "
        "parsed from the user's message (e.g. 'notify me 15 minutes "
        "before' -> 15)."
    )


class ConfirmPendingCalendarAction(BaseModel):
    """The user's latest message is a short affirmative reply (yes/
    confirm/go ahead/do it) to a delete or update the assistant just asked
    them to confirm — i.e. the message immediately before this one in the
    conversation was the user's own delete/update request, and this
    message is them saying yes to it."""

    action: Literal["delete", "update"] = Field(
        description="Which action is being confirmed, reconstructed from "
        "the user's own preceding request in the conversation."
    )
    reminder_minutes: Optional[int] = Field(
        default=None,
        description="Required when action='update': the reminder lead "
        "time (minutes) the user asked for in their preceding request. "
        "Leave null for action='delete'.",
    )


class CancelPendingCalendarAction(BaseModel):
    """The user's latest message is declining/cancelling (no/never mind/
    don't) a delete or update the assistant just asked them to confirm."""


_CALENDAR_TOOL_CLASSES = [
    CreatePassInvite,
    DeletePassInvite,
    UpdatePassInviteReminder,
    ConfirmPendingCalendarAction,
    CancelPendingCalendarAction,
]
_CALENDAR_TOOL_NAME_MAP = {cls.__name__: cls for cls in _CALENDAR_TOOL_CLASSES}

_calendar_action_model = ChatAnthropic(
    model_name=CALENDAR_ACTION_MODEL,
    temperature=0,
    timeout=10,  # fail fast rather than hang
    max_retries=2,
    stop=None,
).bind_tools(_CALENDAR_TOOL_CLASSES)

CALENDAR_ACTION_SYSTEM_PROMPT = """You are deciding which calendar action \
to take for AstroWatch, a satellite pass tracking assistant. The user has \
already been routed here because they explicitly asked for something \
calendar-related about the currently selected satellite pass.

Call exactly one tool:
- create_pass_invite — a fresh request to add/save/schedule the pass.
- delete_pass_invite — a fresh request to delete/remove/cancel the invite.
- update_pass_invite_reminder — a fresh request to change the reminder \
lead time.
- confirm_pending_calendar_action — the user's latest message is a short \
yes/confirm/go-ahead reply, and the message immediately before it (also \
from the user — no assistant reply happened in between, they're waiting \
on a confirmation) was a delete or update request. Reconstruct which \
action, and for update which reminder_minutes, from that preceding \
message.
- cancel_pending_calendar_action — the user's latest message is a short \
no/never-mind/decline reply to that same kind of preceding request.

If the latest message doesn't clearly fit any of these, default to \
create_pass_invite.
"""


def _format_recent_history(messages: list, limit: int = 6) -> str:
    return "\n".join(f"{m.role}: {m.content}" for m in messages[-limit:])


async def _classify_calendar_action(state: AgentState) -> BaseModel:
    """
    Real Anthropic tool-calling (LangChain's bind_tools, same mechanism as
    the raw SDK's native tool use) over a cheap model — reads recent
    conversation history and picks exactly one of the five calendar tools
    above. Falls back to CreatePassInvite (today's only behavior) on any
    classification failure, so this is purely additive.
    """
    messages = state.get("messages", [])
    selected_pass = state.get("selected_pass")

    prompt = (
        f"Recent conversation:\n{_format_recent_history(messages)}\n\n"
        f"Currently selected pass: "
        f"{selected_pass.satname if selected_pass else 'none'}\n\n"
        "Which calendar tool should be called?"
    )

    try:
        response = await _calendar_action_model.ainvoke(
            [
                SystemMessage(content=CALENDAR_ACTION_SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ]
        )
        tool_calls = getattr(response, "tool_calls", None) or []
        if not tool_calls:
            return CreatePassInvite()

        call = tool_calls[0]
        tool_cls = _CALENDAR_TOOL_NAME_MAP.get(call["name"])
        if tool_cls is None:
            return CreatePassInvite()
        return tool_cls(**call.get("args", {}))
    except Exception:
        traceback.print_exc()
        return CreatePassInvite()


# ── existing helpers (token refresh, MCP error handling) ────────────────


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
    correct in one place — every tool call this file makes shares this
    same failure shape (a dead access_token) and gets the same handling
    for free.
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


# ── delete / update dispatch — search every writable calendar for the
# AstroWatch-created event, since we don't persist which calendar the
# original create landed on. Stops at the first match. ───────────────────


async def _delete_across_calendars(
    session, access_token: str, writable: list[dict], dedupe_key: str,
    clerk_user_id: str,
) -> dict:
    for cal in writable:
        result = await session.call_tool(
            "delete_event",
            {
                "access_token": access_token,
                "calendar_id": cal["id"],
                "dedupe_key": dedupe_key,
            },
        )
        error = await _handle_tool_error(result, clerk_user_id, "delete_event")
        if error:
            return error
        if (result.structuredContent or {}).get("deleted"):
            return {
                "calendar_data": CalendarData(
                    action="deleted",
                    summary="Removed the pass from your calendar.",
                ),
                "tools_used": ["google_calendar"],
            }

    return {
        "calendar_data": CalendarData(
            action="not_found",
            summary="I couldn't find an AstroWatch invite for that pass "
            "on your calendar.",
        )
    }


async def _update_across_calendars(
    session, access_token: str, writable: list[dict], dedupe_key: str,
    reminder_minutes: int, clerk_user_id: str,
) -> dict:
    for cal in writable:
        result = await session.call_tool(
            "update_event",
            {
                "access_token": access_token,
                "calendar_id": cal["id"],
                "dedupe_key": dedupe_key,
                "reminder_minutes": reminder_minutes,
            },
        )
        error = await _handle_tool_error(result, clerk_user_id, "update_event")
        if error:
            return error
        data = result.structuredContent or {}
        if data.get("updated"):
            return {
                "calendar_data": CalendarData(
                    action="updated",
                    event_link=data.get("htmlLink"),
                    summary=f"Updated the reminder to {reminder_minutes} "
                    "minutes before the pass.",
                ),
                "tools_used": ["google_calendar"],
            }

    return {
        "calendar_data": CalendarData(
            action="not_found",
            summary="I couldn't find an AstroWatch invite for that pass "
            "on your calendar.",
        )
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
    # a real write to the user's calendar. Needed by all three actions —
    # delete/update's dedupe_key is derived from selected_pass too.
    violation = validate_selected_pass(selected_pass)
    if violation:
        return {
            "calendar_data": CalendarData(
                action="invalid", summary=violation.user_message
            ),
            "errors": [f"calendar_node_guardrail: {violation.code}"],
        }

    # Guardrail 2 — per-user write throttle. Checked before spending an
    # access-token refresh + LLM classification call on a request we're
    # going to refuse anyway.
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

    dedupe_key = compute_dedupe_key(
        clerk_user_id, selected_pass.satid, selected_pass.startUTC
    )

    action = await _classify_calendar_action(state)

    # ── fresh delete/update requests — confirm before touching anything ──
    if isinstance(action, DeletePassInvite):
        return {
            "calendar_data": CalendarData(
                action="needs_confirmation",
                confirmation_kind="delete",
                summary=f"Delete your AstroWatch invite for the "
                f"{selected_pass.satname} pass?",
                calendar_options=[
                    {"label": "Yes, delete it", "value": "confirm"},
                    {"label": "No, keep it", "value": "cancel"},
                ],
            )
        }

    if isinstance(action, UpdatePassInviteReminder):
        violation = validate_reminder_minutes(action.reminder_minutes)
        if violation:
            return {
                "calendar_data": CalendarData(
                    action="invalid", summary=violation.user_message
                ),
                "errors": [f"calendar_node_guardrail: {violation.code}"],
            }
        return {
            "calendar_data": CalendarData(
                action="needs_confirmation",
                confirmation_kind="update",
                summary=f"Update the reminder on your "
                f"{selected_pass.satname} pass invite to "
                f"{action.reminder_minutes} minutes before it starts?",
                calendar_options=[
                    {
                        "label": f"Yes, remind me {action.reminder_minutes} min before",
                        "value": "confirm",
                    },
                    {"label": "No, keep it as-is", "value": "cancel"},
                ],
            )
        }

    if isinstance(action, CancelPendingCalendarAction):
        return {
            "calendar_data": CalendarData(
                action="cancelled",
                summary="Okay, I won't change your calendar.",
            )
        }

    # Everything past this point needs the MCP session: CreatePassInvite
    # (existing flow) or a confirmed delete/update.
    try:
        connections: dict[str, Connection] = {
            "calendar": StreamableHttpConnection(
                transport="streamable_http",
                url=CALENDAR_MCP_URL,
                headers={"Authorization": f"Bearer {CALENDAR_MCP_SERVICE_KEY}"},
            )
        }
        client = MultiServerMCPClient(connections)
        async with client.session("calendar") as session:
            calendars_result = await session.call_tool(
                "list_calendars", {"access_token": access_token}
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

            # ── confirmed delete/update — search every writable calendar
            # for the AstroWatch-created event and act on it. ───────────
            if isinstance(action, ConfirmPendingCalendarAction):
                if action.action == "delete":
                    return await _delete_across_calendars(
                        session, access_token, writable, dedupe_key,
                        clerk_user_id,
                    )

                # action.action == "update"
                if action.reminder_minutes is None:
                    return {
                        "calendar_data": CalendarData(
                            action="invalid",
                            summary="I lost track of what reminder time "
                            "you wanted — could you ask again?",
                        )
                    }
                violation = validate_reminder_minutes(action.reminder_minutes)
                if violation:
                    return {
                        "calendar_data": CalendarData(
                            action="invalid", summary=violation.user_message
                        ),
                        "errors": [f"calendar_node_guardrail: {violation.code}"],
                    }
                return await _update_across_calendars(
                    session, access_token, writable, dedupe_key,
                    action.reminder_minutes, clerk_user_id,
                )

            # ── create (existing flow, unchanged) ────────────────────────
            # Step 1 — ambiguity check: does the user have more than one
            # writable calendar? NOTE: field names below (accessRole,
            # primary, summary) are the standard Google Calendar API v3
            # CalendarList shape — worth confirming against a real
            # list_calendars response the first time this runs, same as
            # every other MCP tool wrapper we've built this week.
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
                        confirmation_kind="calendar_picker",
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
                    "access_token": access_token,
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
