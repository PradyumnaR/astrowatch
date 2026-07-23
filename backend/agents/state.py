"""
Shared state schema for the LangGraph multi-agent system.
All nodes read from and write to this single AgentState.
"""

import operator
from typing import Annotated, Literal, Optional, TypedDict
from pydantic import BaseModel, Field

from agents.models import ChatMessage, Location, SatellitePass
from backend.tools import passes


class RoutingDecision(BaseModel):
    """Structured output produced by the orchestrator node."""

    intent: Literal["passes", "weather", "knowledge", "all"] = Field(
        description="Primary intent of the user's latest message"
    )
    agents_to_call: list[Literal["satellite", "weather", "knowledge"]] = Field(
        description="Which specialist agents to invoke, possibly in parallel"
    )
    reasoning: str = Field(
        description="Brief explanation of why this routing was chosen"
    )
    resolved_query: str = Field(
        description="The user's latest message rewritten as a fully "
        "self-contained query, resolving pronouns/references using "
        "conversation history and the selected satellite"
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


class AgentState(TypedDict):
    # ── input (reuses existing request models directly) ──────────
    messages: list[ChatMessage]
    location: Optional[Location]
    selected_pass: Optional[SatellitePass]

    # ── routing ────────────────────────────────────────────────────
    routing: Optional[RoutingDecision]

    # ── per-agent outputs (None if that agent wasn't called) ───────
    passes_data: Optional[PassesData]
    weather_data: Optional[WeatherData]
    knowledge_data: Optional[KnowledgeData]

    # ── accumulated across parallel branches — needs a reducer ─────
    tools_used: Annotated[list[str], operator.add]
    sources: Annotated[list[str], operator.add]
    errors: Annotated[list[str], operator.add]

    # ── output ───────────────────────────────────────────────────
    final_response: Optional[str]
