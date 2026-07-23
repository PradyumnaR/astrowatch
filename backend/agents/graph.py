"""
Builds and compiles the AstroWatch multi-agent StateGraph.

Node responsibilities:
  orchestrator   -> classifies intent, resolves multi-turn references
  satellite      -> N2YO pass predictions           (Day 3 — stub for now)
  weather        -> Open-Meteo viewing conditions    (Day 3 — stub for now)
  knowledge      -> pgvector RAG search              (Day 3 — stub for now)
  report_writer  -> synthesizes all outputs          (Day 4 — stub for now)
"""

from typing import Sequence
from langgraph.graph import StateGraph, END

from agents.orchestrator import orchestrator_node
from agents.state import AgentState

# ── stub nodes — will move to their own files on Day 3/4 ──────────


def satellite_node(state: AgentState) -> AgentState:
    raise NotImplementedError("Satellite Agent — Day 3")


def weather_node(state: AgentState) -> AgentState:
    raise NotImplementedError("Weather Agent — Day 3")


def knowledge_node(state: AgentState) -> AgentState:
    raise NotImplementedError("Knowledge Agent — Day 3")


def report_writer_node(state: AgentState) -> AgentState:
    raise NotImplementedError("Report Writer Agent — Day 4")


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
graph.add_node("report_writer", report_writer_node)

graph.set_entry_point("orchestrator")

graph.add_conditional_edges(
    "orchestrator",
    route_after_orchestrator,
    {
        "satellite": "satellite",
        "weather": "weather",
        "knowledge": "knowledge",
    },
)

graph.add_edge("satellite", "report_writer")
graph.add_edge("weather", "report_writer")
graph.add_edge("knowledge", "report_writer")
graph.add_edge("report_writer", END)

compiled_graph = graph.compile()
