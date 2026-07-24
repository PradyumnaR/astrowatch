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

from agents.graph.orchestrator_node import orchestrator_node
from agents.graph.satellite_node import satellite_node
from agents.graph.weather_node import weather_node
from agents.graph.knowledge_node import knowledge_node
from agents.graph.report_writer_node import report_writer_node
from agents.graph.state import AgentState


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
