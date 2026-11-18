"""
Shared state schema for the LangGraph multi-agent system.
All nodes read from and write to this single AgentState.
"""

from typing import Annotated, Literal, Optional, TypedDict
from pydantic import BaseModel, Field

from agents.models import ChatMessage, Location, SatellitePass

# ── reducers ─────────────────────────────────────────────────────
# A reducer decides how a node's (or a request's) update combines with
# the value already in state. These matter once a checkpointer loads the
# previous turn's state before the new turn starts.

MAX_STORED_MESSAGES = 40  # ~20 exchanges; bounds prompt size and Redis memory


def append_messages(
    existing: list[ChatMessage] | None, new: list[ChatMessage] | None
) -> list[ChatMessage]:
    combined = (existing or []) + (new or [])
    return combined[-MAX_STORED_MESSAGES:]


def per_turn_list(existing: list[str] | None, new: list[str] | None) -> list[str]:
    """Accumulates within one turn (including parallel branches).

    Passing None resets it — the chat entrypoint does that at the start
    of every turn, so turn 2 never inherits turn 1's tools/sources/errors.
    """
    if new is None:
        return []
    return (existing or []) + new


class RoutingDecision(BaseModel):
    """Structured output produced by the orchestrator node."""

    intent: Literal["passes", "weather", "knowledge", "calendar", "all"] = Field(
        description="Primary intent of the user's latest message"
    )
    agents_to_call: list[Literal["satellite", "weather", "knowledge", "calendar"]] = (
        Field(description="Which specialist agents to invoke, possibly in parallel")
    )
    reasoning: str = Field(
        description="Brief explanation of why this routing was chosen"
    )
    resolved_query: str = Field(
        description="The user's latest message rewritten as a fully "
        "self-contained query, resolving pronouns/references using "
        "conversation history and the selected satellite"
    )
    norad_id: Optional[int] = Field(
        default=None,
        description="NORAD ID of the satellite explicitly named in the "
        "user's message, if any (e.g. user asks about Hubble while ISS "
        "is selected). Leave null if no specific satellite is named — "
        "the currently selected satellite will be used as the default.",
    )


class PassesData(BaseModel):
    """Structured output from the Satellite Agent."""

    passes: list[dict] = Field(default_factory=list)
    best_pass: Optional[dict] = None
    viewing_tips: str = ""


class WeatherData(BaseModel):
    """Structured output from the Weather Agent."""

    cloud_cover: Optional[float] = None
    temperature: Optional[float] = None
    wind_speed: Optional[float] = None
    conditions_summary: str = ""
    go_no_go: Literal["go", "no-go", "marginal"] = "marginal"


class KnowledgeData(BaseModel):
    """Structured output from the Knowledge Agent."""

    chunks: list[dict] = Field(default_factory=list)
    summary: str = ""
    citations: list[str] = Field(default_factory=list)


class CalendarData(BaseModel):
    """Structured output from the Calendar Agent."""

    action: Literal[
        "created",
        "deleted",
        "updated",
        "cancelled",
        "not_connected",
        "not_found",
        "error",
        "invalid",
        "rate_limited",
    ] = "error"
    already_existed: Optional[bool] = False
    event_link: Optional[str] = None  # Google's htmlLink, on success
    summary: str = ""  # human-readable outcome, read by report_writer


class CalendarChoice(BaseModel):
    """One button on the confirmation card."""

    label: str  # what the user sees, e.g. "Work" or "Yes, delete it"
    value: (
        str  # what comes back when they click it: a calendar id, or "confirm"/"cancel"
    )


class PendingCalendarAction(BaseModel):
    """A calendar write that's planned but not yet carried out.

    Set by calendar_plan, read by calendar_confirm (to ask the user) and
    calendar_execute (to do it). While the graph is paused waiting for the
    user's answer, this is what the checkpointer saves, so the action
    survives exactly as planned. Nothing has to be re-derived from the
    conversation text.
    """

    kind: Literal["create", "delete", "update"]
    # Writable calendars from list_calendars ([{"id", "summary", ...}]).
    # Kept so execute doesn't need a second list_calendars call.
    calendars: list[dict] = Field(default_factory=list)
    # update only: the reminder lead time the user asked for
    reminder_minutes: Optional[int] = None
    # create only: known up front when there's just one writable calendar
    calendar_id: Optional[str] = None
    # Set only when the user must approve or choose first
    question: Optional[str] = None
    options: list[CalendarChoice] = Field(default_factory=list)


class AgentState(TypedDict):
    # ── persistent across turns (saved by the checkpointer) ──────
    messages: Annotated[list[ChatMessage], append_messages]

    # ── per-request input (overwritten every turn) ───────────────
    location: Optional[Location]
    selected_pass: Optional[SatellitePass]
    clerk_user_id: Optional[str]

    # ── per-turn outputs (reset to None every turn) ──────────────
    routing: Optional[RoutingDecision]
    passes_data: Optional[PassesData]
    weather_data: Optional[WeatherData]
    knowledge_data: Optional[KnowledgeData]
    calendar_data: Optional[CalendarData]
    # Planned-but-not-yet-approved calendar write. Survives the
    # interrupt() pause via the checkpointer; reset at the start of every
    # new turn so an abandoned confirmation never carries over.
    pending_calendar_action: Optional[PendingCalendarAction]
    final_response: Optional[str]

    # ── per-turn, accumulated across parallel branches ───────────
    # None is the per-turn reset sentinel (see per_turn_list); the
    # reducer always stores a list[str] after it runs.
    tools_used: Annotated[list[str] | None, per_turn_list]
    sources: Annotated[list[str] | None, per_turn_list]
    errors: Annotated[list[str] | None, per_turn_list]

    # Guardrail interventions that *succeeded* (e.g. a routing decision
    # got corrected). Deliberately separate from `errors`, which
    # chat_v2.py surfaces to the user as "something went wrong".
    guardrail_events: Annotated[list[str] | None, per_turn_list]


# Every Pydantic model stored anywhere in AgentState must be listed here,
# or it comes back from the checkpointer as a plain dict on the next turn.
# tests/test_checkpoint_types.py fails if one is missing.
CHECKPOINT_TYPES: tuple[type[BaseModel], ...] = (
    ChatMessage,
    Location,
    SatellitePass,
    RoutingDecision,
    PassesData,
    WeatherData,
    KnowledgeData,
    CalendarData,
    PendingCalendarAction,
    CalendarChoice,
)
