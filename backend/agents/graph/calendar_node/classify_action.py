import traceback
from pydantic import BaseModel, Field
from agents.graph.state import AgentState
from utils.format_history import format_history
from typing import Optional
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_anthropic import ChatAnthropic
from typing import Literal, Optional

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

If the latest message doesn't clearly fit any single one of these, do \
not call any tool — it's safer to ask the user to clarify than to guess, \
since every one of these tools results in a real change (or a real \
question) about the user's actual calendar.
"""


async def classify_action(state: AgentState) -> Optional[BaseModel]:
    """
    Real Anthropic tool-calling (LangChain's bind_tools, same mechanism as
    the raw SDK's native tool use) over a cheap model — reads recent
    conversation history and picks exactly one of the five calendar tools
    above.

    Returns None — never a guessed action — when the model doesn't call a
    tool at all, calls one we don't recognize, or the call outright fails
    (timeout, API error, ...). calendar_node treats None as "couldn't
    figure out what you wanted" and fails safely with a chat message
    rather than silently defaulting to create (a real write) on a
    classification failure.
    """
    messages = state.get("messages", [])
    selected_pass = state.get("selected_pass")

    prompt = (
        f"Recent conversation:\n{format_history(messages)}\n\n"
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
            return None

        call = tool_calls[0]
        tool_cls = _CALENDAR_TOOL_NAME_MAP.get(call["name"])
        if tool_cls is None:
            return None
        return tool_cls(**call.get("args", {}))
    except Exception:
        traceback.print_exc()
        return None
