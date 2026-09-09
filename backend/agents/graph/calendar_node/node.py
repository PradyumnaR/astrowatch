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
ambiguous. create/delete/update all confirm before doing anything
irreversible: create confirms which calendar to use when there's more
than one (confirmation_kind == "create"), delete/update confirm the
action itself (confirmation_kind == "delete"/"update") — all surfaced by
chat_v2.py as an elicitation event. And if the action classifier itself
can't tell what the user wants, calendar_node fails safely with a chat
message asking them to clarify, rather than guessing "create".
"""

import os
import traceback

from langchain_mcp_adapters.client import MultiServerMCPClient
from agents.graph.state import AgentState, CalendarData
from langchain_mcp_adapters.sessions import Connection, StreamableHttpConnection
from app_guardrails.calendar_guardrails import (
    calendar_write_throttle,
    compute_dedupe_key,
    validate_reminder_minutes,
    validate_selected_pass,
)
from agents.graph.calendar_node.delete_invite import delete_across_calendars
from agents.graph.calendar_node.get_valid_access_token import get_valid_access_token
from agents.graph.calendar_node.classify_action import (
    CancelPendingCalendarAction,
    ConfirmPendingCalendarAction,
    CreatePassInvite,
    DeletePassInvite,
    UpdatePassInviteReminder,
    classify_action,
)
from agents.graph.calendar_node.handle_tool_error import handle_tool_error
from agents.graph.calendar_node.update_invite import update_invite
from agents.graph.calendar_node.create_invite import create_invite

PORT = os.getenv(
    "PORT", "8000"
)  # Render sets this at runtime; 8000 is just the local dev fallback

CALENDAR_MCP_URL = f"http://localhost:{PORT}/mcp/calendar"
CALENDAR_MCP_SERVICE_KEY = os.getenv("CALENDAR_MCP_SERVICE_KEY")


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

    access_token = await get_valid_access_token(clerk_user_id)
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

    # main call in the calendar_node used. LLM uses user message
    # to classify between different tool calls create_invite/delete_invite etc.,
    action = await classify_action(state)
    print("action =>>>", action)

    # No guessing — a classification failure never falls back to a real
    # write. Fail safely with a message the user can act on instead.
    if action is None:
        return {
            "calendar_data": CalendarData(
                action="error",
                summary="I couldn't tell what you wanted to do with your "
                "calendar — could you rephrase that?",
            ),
            "errors": ["calendar_node_error: action_classification_failed"],
        }

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

    # Everything past this point needs the MCP session: only
    # CreatePassInvite (a fresh add) or ConfirmPendingCalendarAction (a
    # confirmed delete/update) should ever reach here — checked explicitly
    # below, with a defensive fail-safe else in case a future tool type
    # gets added to the classifier without a matching branch here.
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
            error = await handle_tool_error(
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
                    return await delete_across_calendars(
                        session,
                        access_token,
                        writable,
                        dedupe_key,
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
                return await update_invite(
                    session,
                    access_token,
                    writable,
                    dedupe_key,
                    action.reminder_minutes,
                    clerk_user_id,
                )

            elif isinstance(action, CreatePassInvite):
                return await create_invite(
                    session,
                    latest_message,
                    writable,
                    selected_pass,
                    dedupe_key,
                    access_token,
                    clerk_user_id,
                )

            else:
                # Defensive only — every real path above should have
                # matched by now. Fails safely rather than silently
                # falling through to a create.
                return {
                    "calendar_data": CalendarData(
                        action="error",
                        summary="Something went wrong figuring out what "
                        "calendar action to take — please try again.",
                    ),
                    "errors": [
                        f"calendar_node_error: unexpected_action_type:{type(action).__name__}"
                    ],
                }

    except Exception as e:
        traceback.print_exc()
        return {
            "calendar_data": CalendarData(
                action="error", summary=f"Calendar error: {e}"
            ),
            "errors": [f"calendar_node_error: {e}"],
        }
