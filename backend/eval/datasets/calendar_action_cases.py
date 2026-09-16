"""
Trajectory dataset for calendar_node's classify_action
(agents/graph/calendar_node/classify_action.py).

Each case is a conversation history and the exact Pydantic tool class
(+ any pinned fields) classify_action should return — CreatePassInvite,
DeletePassInvite, UpdatePassInviteReminder, ConfirmPendingCalendarAction,
CancelPendingCalendarAction, or None when the message doesn't clearly fit
any single tool (classify_action must fail safe, never guess "create").
"""

from dataclasses import dataclass, field
from typing import Optional, Type

from agents.models import ChatMessage
from agents.graph.calendar_node.classify_action import (
    CancelPendingCalendarAction,
    ConfirmPendingCalendarAction,
    CreatePassInvite,
    DeletePassInvite,
    UpdatePassInviteReminder,
)


def _msgs(*turns: tuple[str, str]) -> list[ChatMessage]:
    return [ChatMessage(role=role, content=content) for role, content in turns]


@dataclass
class CalendarActionCase:
    id: str
    messages: list[ChatMessage]
    expected_class: Optional[Type]  # None means classify_action must return None
    # Only the fields pinned here are checked against the returned model's
    # own field values — fields the case doesn't care about are ignored.
    expected_fields: dict = field(default_factory=dict)


CALENDAR_ACTION_CASES: list[CalendarActionCase] = [
    CalendarActionCase(
        id="create_fresh",
        messages=_msgs(("user", "Add this pass to my calendar")),
        expected_class=CreatePassInvite,
    ),
    CalendarActionCase(
        id="delete_fresh",
        messages=_msgs(("user", "Remove this from my calendar")),
        expected_class=DeletePassInvite,
    ),
    CalendarActionCase(
        id="update_fresh_with_minutes",
        messages=_msgs(("user", "Remind me 15 minutes before this pass")),
        expected_class=UpdatePassInviteReminder,
        expected_fields={"reminder_minutes": 15},
    ),
    CalendarActionCase(
        id="confirm_delete",
        messages=_msgs(
            ("user", "Delete this pass from my calendar"),
            ("assistant", "Delete your AstroWatch invite for the ISS pass?"),
            ("user", "yes, go ahead"),
        ),
        expected_class=ConfirmPendingCalendarAction,
        expected_fields={"action": "delete"},
    ),
    CalendarActionCase(
        id="confirm_update_with_minutes",
        messages=_msgs(
            ("user", "Change the reminder to 30 minutes before"),
            (
                "assistant",
                "Update the reminder on your ISS pass invite to 30 minutes "
                "before it starts?",
            ),
            ("user", "yes"),
        ),
        expected_class=ConfirmPendingCalendarAction,
        expected_fields={"action": "update", "reminder_minutes": 30},
    ),
    CalendarActionCase(
        id="cancel_pending",
        messages=_msgs(
            ("user", "Delete this pass from my calendar"),
            ("assistant", "Delete your AstroWatch invite for the ISS pass?"),
            ("user", "no, never mind"),
        ),
        expected_class=CancelPendingCalendarAction,
    ),
    CalendarActionCase(
        id="ambiguous_no_tool",
        messages=_msgs(("user", "What's up with my calendar lately?")),
        expected_class=None,
    ),
]
