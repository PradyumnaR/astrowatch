"""
Builds and compiles the AstroWatch multi-agent StateGraph.

Node responsibilities:
  orchestrator   -> classifies intent, resolves multi-turn references
  satellite      -> N2YO pass predictions           (Day 3 — stub for now)
  weather        -> Open-Meteo viewing conditions    (Day 3 — stub for now)
  knowledge      -> pgvector RAG search              (Day 3 — stub for now)
  report_writer  -> synthesizes all outputs          (Day 4 — stub for now)
"""

import logging

from typing import Sequence
from langgraph.graph import StateGraph, END

from agents.graph.orchestrator_node import orchestrator_node
from agents.graph.satellite_node import satellite_node
from agents.graph.weather_node import weather_node
from agents.graph.knowledge_node import knowledge_node
from agents.graph.report_writer_node import report_writer_node
from agents.graph.calendar_node.node import (
    calendar_confirm,
    calendar_execute,
    calendar_plan,
)
from agents.graph.state import AgentState
from contextlib import asynccontextmanager

from fastapi import FastAPI
from langgraph.graph.state import CompiledStateGraph

from agents.graph.state import AgentState, CHECKPOINT_TYPES
from shared.checkpointer import build_serializer, get_checkpointer

log = logging.getLogger(__name__)


# ── conditional routing ────────────────────────────────────────────


def route_after_orchestrator(state: AgentState) -> Sequence[str]:
    """Reads routing.agents_to_call and fans out to those node(s)."""
    routing = state["routing"]
    if routing is None:
        return ["satellite", "weather", "knowledge"]  ## safe callback
    return routing.agents_to_call


# ── build + compile ────────────────────────────────────────────────

graph = StateGraph(AgentState)

graph.add_node("orchestrator", orchestrator_node)
graph.add_node("satellite", satellite_node)
graph.add_node("weather", weather_node)
graph.add_node("knowledge", knowledge_node)
graph.add_node("calendar_plan", calendar_plan)
graph.add_node("calendar_confirm", calendar_confirm)
graph.add_node("calendar_execute", calendar_execute)
graph.add_node("report_writer", report_writer_node)

graph.set_entry_point("orchestrator")

graph.add_conditional_edges(
    "orchestrator",
    route_after_orchestrator,
    {
        "satellite": "satellite",
        "weather": "weather",
        "knowledge": "knowledge",
        "calendar": "calendar_plan",
    },
)

graph.add_edge("satellite", "report_writer")
graph.add_edge("weather", "report_writer")
graph.add_edge("knowledge", "report_writer")


def route_after_calendar_plan(state: AgentState) -> str:
    pending = state.get("pending_calendar_action")
    if pending is None:
        return "report_writer"  # plan ended with an outcome (error, not connected, ...)
    return "calendar_confirm" if pending.question else "calendar_execute"


def route_after_calendar_confirm(state: AgentState) -> str:
    # Cancelled or invalid choice clears the pending action
    return (
        "calendar_execute" if state.get("pending_calendar_action") else "report_writer"
    )


graph.add_conditional_edges(
    "calendar_plan",
    route_after_calendar_plan,
    {
        "calendar_confirm": "calendar_confirm",
        "calendar_execute": "calendar_execute",
        "report_writer": "report_writer",
    },
)
graph.add_conditional_edges(
    "calendar_confirm",
    route_after_calendar_confirm,
    {"calendar_execute": "calendar_execute", "report_writer": "report_writer"},
)
graph.add_edge("calendar_execute", "report_writer")

graph.add_edge("report_writer", END)

_compiled: CompiledStateGraph[AgentState] | None = None


def get_graph() -> CompiledStateGraph[AgentState]:
    if _compiled is None:
        raise RuntimeError("Graph not compiled. Is graph_lifespan registered?")
    return _compiled


@asynccontextmanager
async def graph_lifespan(app: FastAPI):
    global _compiled
    checkpointer = get_checkpointer()
    checkpointer.serde = build_serializer(CHECKPOINT_TYPES)
    _compiled = graph.compile(checkpointer=checkpointer)
    log.warning("Checkpointer allowlist: %s", checkpointer.serde._allowed_json_modules)
    log.info("Graph compiled with Redis checkpointer")
    try:
        yield
    finally:
        _compiled = None
