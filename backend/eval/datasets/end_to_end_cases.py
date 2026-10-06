"""
End-to-end dataset for report_writer_node (agents/graph/report_writer_node.py),
one case per CalendarData.action state it has to synthesize a response
for (every value except "needs_confirmation" — that state routes straight
to END in graph.py, skipping report_writer_node entirely, so it isn't a
report_writer_node case at all).

Each case supplies the full AgentState report_writer_node would see after
the rest of the graph ran — messages, selected pass, and calendar_data —
plus a reference_answer describing what a correct response must actually
say, for human review alongside the DeepEval Faithfulness/TaskCompletion
scores.
"""

from dataclasses import dataclass

from agents.graph.state import CalendarData
from agents.models import ChatMessage, SatellitePass

_ISS_PASS = SatellitePass(
    satid=25544,
    satname="ISS",
    startAz=45.0,
    startAzCompass="NE",
    startEl=10.0,
    startUTC=2_000_000_000,
    maxAz=180.0,
    maxEl=72.0,
    maxUTC=2_000_000_300,
    endAz=270.0,
    endUTC=2_000_000_600,
    mag=-1.8,
    duration=360,
)


@dataclass
class EndToEndCase:
    id: str
    user_message: str
    calendar_data: CalendarData
    reference_answer: str


END_TO_END_CASES: list[EndToEndCase] = [
    EndToEndCase(
        id="calendar_created",
        user_message="Add this pass to my calendar",
        calendar_data=CalendarData(
            action="created",
            event_link="https://calendar.google.com/event?eid=abc123",
            summary="Added ISS pass to calendar.",
        ),
        reference_answer=(
            "Confirms the ISS pass was added to the calendar and includes "
            "the event link as a clickable markdown link."
        ),
    ),
    EndToEndCase(
        id="calendar_deleted",
        user_message="Delete this pass from my calendar",
        calendar_data=CalendarData(
            action="deleted",
            summary="Removed the pass from your calendar.",
        ),
        reference_answer="Confirms the calendar invite for the pass was removed.",
    ),
    EndToEndCase(
        id="calendar_updated",
        user_message="Change my reminder to 20 minutes before",
        calendar_data=CalendarData(
            action="updated",
            event_link="https://calendar.google.com/event?eid=abc123",
            summary="Updated the reminder to 20 minutes before the pass.",
        ),
        reference_answer=(
            "Confirms the reminder was updated to 20 minutes before the "
            "pass, including the event link."
        ),
    ),
    EndToEndCase(
        id="calendar_cancelled",
        user_message="no, never mind",
        calendar_data=CalendarData(
            action="cancelled",
            summary="Okay, I won't change your calendar.",
        ),
        reference_answer=(
            "Briefly acknowledges the cancellation without apologizing or "
            "asking again."
        ),
    ),
    EndToEndCase(
        id="calendar_not_found",
        user_message="Delete this pass from my calendar",
        calendar_data=CalendarData(
            action="not_found",
            summary="I couldn't find an AstroWatch invite for that pass on your calendar.",
        ),
        reference_answer=(
            "States plainly that no AstroWatch invite exists for this pass "
            "— does not imply anything was deleted."
        ),
    ),
    EndToEndCase(
        id="calendar_invalid",
        user_message="Add this pass to my calendar",
        calendar_data=CalendarData(
            action="invalid",
            summary="That pass has already happened, so I won't add it.",
        ),
        reference_answer=(
            "States plainly that the pass couldn't be added because it's "
            "already happened, without excessive apology."
        ),
    ),
    EndToEndCase(
        id="calendar_rate_limited",
        user_message="Add this pass to my calendar",
        calendar_data=CalendarData(
            action="rate_limited",
            summary="You've added several calendar events recently — please wait a bit before adding more.",
        ),
        reference_answer=(
            "Tells the user they've hit a rate limit on calendar writes and "
            "should wait before trying again."
        ),
    ),
    EndToEndCase(
        id="calendar_not_connected",
        user_message="Add this pass to my calendar",
        calendar_data=CalendarData(
            action="not_connected",
            summary="Google Calendar isn't connected yet.",
        ),
        reference_answer=(
            "Tells the user Google Calendar isn't connected and to connect "
            "it from Settings first."
        ),
    ),
    EndToEndCase(
        id="calendar_error",
        user_message="Add this pass to my calendar",
        calendar_data=CalendarData(
            action="error",
            summary="Calendar error during create_event: internal server error",
        ),
        reference_answer=(
            "Apologizes briefly for the failure and suggests trying again, "
            "without dumping the raw internal error text."
        ),
    ),
]

ISS_PASS = _ISS_PASS


def make_messages(user_message: str) -> list[ChatMessage]:
    return [ChatMessage(role="user", content=user_message)]
