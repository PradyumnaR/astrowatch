"""
Calendar Agent — three nodes, so the graph can pause for the user's
approval before any write to their Google Calendar:

  calendar_plan     decide WHAT to do: guardrails, classify the request,
                    list calendars, build a PendingCalendarAction.
                    Never writes anything.
  calendar_confirm  ask the user and wait (interrupt()). Contains nothing
                    with side effects: LangGraph re-runs this node from
                    its first line when the user answers.
  calendar_execute  do the write: create / delete / update.

delete/update always ask first. create asks only when there's more than
one writable calendar to choose from. It can never touch a personal
event the user created themselves: delete/update only ever look an event
up by the deterministic astrowatch_dedupe_key private property, never by
a raw event id supplied by the model or the user.
"""

import os
import traceback
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.sessions import Connection, StreamableHttpConnection
from langgraph.types import interrupt
from mcp import ClientSession

from agents.graph.calendar_node.classify_action import (
    CreatePassInvite,
    DeletePassInvite,
    UpdatePassInviteReminder,
    classify_action,
)
from agents.graph.calendar_node.create_invite import create_invite
from agents.graph.calendar_node.delete_invite import delete_across_calendars
from agents.graph.calendar_node.get_valid_access_token import get_valid_access_token
from agents.graph.calendar_node.handle_tool_error import handle_tool_error
from agents.graph.calendar_node.update_invite import update_invite
from agents.graph.state import (
    AgentState,
    CalendarChoice,
    CalendarData,
    PendingCalendarAction,
)
from app_guardrails.calendar_guardrails import (
    calendar_write_throttle,
    compute_dedupe_key,
    validate_reminder_minutes,
    validate_selected_pass,
)

PORT = os.getenv(
    "PORT", "8000"
)  # Render sets this at runtime; 8000 is just the local dev fallback

CALENDAR_MCP_URL = f"http://localhost:{PORT}/mcp/calendar"
CALENDAR_MCP_SERVICE_KEY = os.getenv("CALENDAR_MCP_SERVICE_KEY")

# Values the confirmation buttons send back on resume (besides calendar ids)
CONFIRM = "confirm"
CANCEL = "cancel"

CalendarOutcome = Literal[
    "cancelled", "not_connected", "error", "invalid", "rate_limited"
]
CalendarRequest = CreatePassInvite | DeletePassInvite | UpdatePassInviteReminder


# ── helpers ──────────────────────────────────────────────────────


@asynccontextmanager
async def calendar_session() -> AsyncIterator[ClientSession]:
    """An MCP session to our own calendar server (mcp_servers/calendar_server.py)."""
    connections: dict[str, Connection] = {
        "calendar": StreamableHttpConnection(
            transport="streamable_http",
            url=CALENDAR_MCP_URL,
            headers={"Authorization": f"Bearer {CALENDAR_MCP_SERVICE_KEY}"},
        )
    }
    client = MultiServerMCPClient(connections)
    async with client.session("calendar") as session:
        yield session


def _outcome(action: CalendarOutcome, summary: str, error: str | None = None) -> dict:
    """A finished calendar turn that didn't write anything."""
    update: dict = {
        "calendar_data": CalendarData(action=action, summary=summary),
        "pending_calendar_action": None,
    }
    if error:
        update["errors"] = [error]
    return update


def _build_pending(
    request: CalendarRequest, writable: list[dict], satname: str
) -> PendingCalendarAction:
    if isinstance(request, DeletePassInvite):
        return PendingCalendarAction(
            kind="delete",
            calendars=writable,
            question=f"Delete your AstroWatch invite for the {satname} pass?",
            options=[
                CalendarChoice(label="Yes, delete it", value=CONFIRM),
                CalendarChoice(label="No, keep it", value=CANCEL),
            ],
        )

    if isinstance(request, UpdatePassInviteReminder):
        minutes = request.reminder_minutes
        return PendingCalendarAction(
            kind="update",
            calendars=writable,
            reminder_minutes=minutes,
            question=f"Update the reminder on your {satname} pass invite to "
            f"{minutes} minutes before it starts?",
            options=[
                CalendarChoice(
                    label=f"Yes, remind me {minutes} min before", value=CONFIRM
                ),
                CalendarChoice(label="No, keep it as-is", value=CANCEL),
            ],
        )

    # CreatePassInvite: only ask when there's a real choice to make
    choices = [
        CalendarChoice(label=str(c.get("summary") or c["id"]), value=str(c["id"]))
        for c in writable
        if c.get("id")
    ]
    if len(choices) > 1:
        return PendingCalendarAction(
            kind="create",
            calendars=writable,
            question=f"Which calendar should I add the {satname} pass to?",
            options=[*choices, CalendarChoice(label="Cancel", value=CANCEL)],
        )
    return PendingCalendarAction(
        kind="create",
        calendars=writable,
        calendar_id=choices[0].value if choices else "primary",
    )


# ── node 1: plan ─────────────────────────────────────────────────


async def calendar_plan(state: AgentState) -> dict:
    clerk_user_id = state.get("clerk_user_id")
    selected_pass = state.get("selected_pass")

    if not clerk_user_id:
        return _outcome(
            "error",
            "No user identity on this request.",
            "calendar_node_error: missing clerk_user_id",
        )
    if selected_pass is None:
        return _outcome("error", "No satellite pass is currently selected to add.")

    # Guardrail 1 — reject an unsafe/implausible pass before any network
    # call. selected_pass is client-supplied and never re-verified against
    # N2YO, so this stands between a bad payload and a real calendar write.
    violation = validate_selected_pass(selected_pass)
    if violation:
        return _outcome(
            "invalid",
            violation.user_message,
            f"calendar_node_guardrail: {violation.code}",
        )

    access_token = await get_valid_access_token(clerk_user_id)
    if access_token is None:
        return _outcome("not_connected", "Google Calendar isn't connected yet.")

    # No guessing: a classification failure never falls back to a write
    request = await classify_action(state)
    if request is None:
        return _outcome(
            "error",
            "I couldn't tell what you wanted to do with your calendar — "
            "could you rephrase that?",
            "calendar_node_error: action_classification_failed",
        )
    if not isinstance(
        request, (CreatePassInvite, DeletePassInvite, UpdatePassInviteReminder)
    ):
        return _outcome(
            "error",
            "Something went wrong figuring out what calendar action to take — please try again.",
            f"calendar_node_error: unexpected_action_type:{type(request).__name__}",
        )

    if isinstance(request, UpdatePassInviteReminder):
        violation = validate_reminder_minutes(request.reminder_minutes)
        if violation:
            return _outcome(
                "invalid",
                violation.user_message,
                f"calendar_node_guardrail: {violation.code}",
            )

    try:
        async with calendar_session() as session:
            result = await session.call_tool(
                "list_calendars", {"access_token": access_token}
            )
            error = await handle_tool_error(result, clerk_user_id, "list_calendars")
            if error:
                return {**error, "pending_calendar_action": None}
    except Exception as e:
        traceback.print_exc()
        return _outcome(
            "error",
            "I couldn't reach your Google Calendar — please try again.",
            f"calendar_node_error: {e}",
        )

    calendars = (result.structuredContent or {}).get("calendars", [])
    writable = [
        c
        for c in calendars
        if c.get("accessRole") in ("owner", "writer") or c.get("primary")
    ] or calendars

    return {
        "pending_calendar_action": _build_pending(
            request, writable, selected_pass.satname
        )
    }


# ── node 2: confirm ──────────────────────────────────────────────


def calendar_confirm(state: AgentState) -> dict:
    """Ask the user and wait.

    LangGraph re-runs this node from the top when the user answers, so it
    must contain nothing costly or with side effects before interrupt().
    """
    pending = state.get("pending_calendar_action")
    if pending is None or not pending.question or not pending.options:
        return _outcome(
            "error",
            "Something went wrong — please try again.",
            "calendar_node_error: confirm_without_pending_action",
        )

    # Pauses the graph here. The checkpointer saves the state, and the
    # payload goes to the frontend as the confirmation card. On resume,
    # interrupt() returns the value of the button the user clicked.
    choice = interrupt(
        {
            "kind": pending.kind,
            "question": pending.question,
            "options": [o.model_dump() for o in pending.options],
        }
    )

    # The resume value comes from the browser: accept only a value we offered
    if choice not in {o.value for o in pending.options}:
        return _outcome(
            "cancelled",
            "Okay, I won't change your calendar.",
            f"calendar_node_guardrail: invalid_resume_choice:{choice!r}",
        )
    if choice == CANCEL:
        return _outcome("cancelled", "Okay, I won't change your calendar.")
    if pending.kind == "create":
        return {
            "pending_calendar_action": pending.model_copy(
                update={"calendar_id": choice}
            )
        }
    return {"pending_calendar_action": pending}  # confirmed delete/update, unchanged


# ── node 3: execute ──────────────────────────────────────────────


async def calendar_execute(state: AgentState) -> dict:
    pending = state.get("pending_calendar_action")
    clerk_user_id = state.get("clerk_user_id")
    selected_pass = state.get("selected_pass")

    if pending is None or not clerk_user_id or selected_pass is None:
        return _outcome(
            "error",
            "Something went wrong — please try again.",
            "calendar_node_error: execute_missing_state",
        )

    # Guardrail 2 — per-user write throttle. Checked here, right before
    # the write, so only real writes count (asking a question doesn't).
    if not calendar_write_throttle.allow(clerk_user_id):
        return _outcome(
            "rate_limited",
            "You've changed several calendar events recently — "
            "please wait a bit before trying again.",
        )

    # Fetched fresh, never stored in state: state is saved to Redis
    access_token = await get_valid_access_token(clerk_user_id)
    if access_token is None:
        return _outcome("not_connected", "Google Calendar isn't connected yet.")

    dedupe_key = compute_dedupe_key(
        clerk_user_id, selected_pass.satid, selected_pass.startUTC
    )

    try:
        async with calendar_session() as session:
            if pending.kind == "create":
                result = await create_invite(
                    session,
                    pending.calendar_id or "primary",
                    selected_pass,
                    dedupe_key,
                    access_token,
                    clerk_user_id,
                )
            elif pending.kind == "delete":
                result = await delete_across_calendars(
                    session,
                    access_token,
                    pending.calendars,
                    dedupe_key,
                    clerk_user_id,
                    selected_pass.satname,
                    selected_pass.startUTC,
                )
            else:  # update
                if pending.reminder_minutes is None:
                    return _outcome(
                        "error",
                        "Something went wrong — please try again.",
                        "calendar_node_error: update_without_reminder_minutes",
                    )
                result = await update_invite(
                    session,
                    access_token,
                    pending.calendars,
                    dedupe_key,
                    pending.reminder_minutes,
                    clerk_user_id,
                    selected_pass.satname,
                    selected_pass.startUTC,
                )
    except Exception as e:
        traceback.print_exc()
        return _outcome(
            "error",
            "Something went wrong updating your calendar — please try again.",
            f"calendar_node_error: {e}",
        )

    return {**result, "pending_calendar_action": None}
