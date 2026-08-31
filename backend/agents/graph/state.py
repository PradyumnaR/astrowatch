"""
Shared state schema for the LangGraph multi-agent system.
All nodes read from and write to this single AgentState.
"""

import operator
from typing import Annotated, Literal, Optional, TypedDict
from pydantic import BaseModel, Field

from agents.models import ChatMessage, Location, SatellitePass


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
        "needs_confirmation",
        "not_connected",
        "error",
        "invalid",
        "rate_limited",
    ] = "error"
    already_existed: Optional[bool] = False
    event_link: Optional[str] = None  # Google's htmlLink, on success
    calendar_options: list[dict] = Field(
        default_factory=list
    )  # [{"label": ..., "value": calendar_id}] — only populated when action == "needs_confirmation"
    summary: str = ""  # human-readable outcome, read by report_writer


class AgentState(TypedDict):
    # ── input (reuses existing request models directly) ──────────
    messages: list[ChatMessage]
    location: Optional[Location]
    selected_pass: Optional[SatellitePass]
    clerk_user_id: Optional[str]

    # ── routing ────────────────────────────────────────────────────
    routing: Optional[RoutingDecision]

    # ── per-agent outputs (None if that agent wasn't called) ───────
    passes_data: Optional[PassesData]
    weather_data: Optional[WeatherData]
    knowledge_data: Optional[KnowledgeData]
    calendar_data: Optional[CalendarData]

    # ── accumulated across parallel branches — needs a reducer ─────
    tools_used: Annotated[list[str], operator.add]
    sources: Annotated[list[str], operator.add]
    errors: Annotated[list[str], operator.add]
    # NEW — guardrail interventions that *succeeded* (e.g. a routing
    # decision got corrected). Deliberately separate from `errors`,
    # which chat_v2.py surfaces to the user as "something went wrong" —
    # a guardrail doing its job correctly is not a failure and shouldn't
    # trigger that message.
    guardrail_events: Annotated[list[str], operator.add]

    # ── output ───────────────────────────────────────────────────
    final_response: Optional[str]
