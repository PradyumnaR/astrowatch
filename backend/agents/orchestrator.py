"""
Orchestrator agent: classifies user intent and produces a routing
decision, using conversation history + selected satellite for
multi-turn reference resolution.
"""

import os
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from agents.state import AgentState, RoutingDecision
from typing import cast

ORCHESTRATOR_MODEL = "claude-haiku-4-5-20251001"

ORCHESTRATOR_SYSTEM_PROMPT = """You are the routing orchestrator for AstroWatch, \
a satellite pass tracking assistant. Given the conversation history, classify \
the user's latest message and decide which specialist agents to call.

Agents available:
- satellite: fetches satellite pass predictions (when/where visible)
- weather: fetches sky viewing conditions (clouds, wind)
- knowledge: searches a space knowledge base (facts, news, missions)

Rules:
- If the latest message references something from earlier in the \
conversation ("it", "that", "what about tomorrow"), resolve it using the \
history and the currently selected satellite before classifying.
- If the query needs multiple kinds of information, set intent to "all" \
and call all three agents in parallel.
- If genuinely ambiguous or you're not confident, default to "all" \
rather than guessing a single wrong intent.
- resolved_query must be fully self-contained — someone with no prior \
context should be able to understand it on its own.
"""

_router_model = ChatAnthropic(
    model_name=ORCHESTRATOR_MODEL,
    temperature=0,
    timeout=10,  # fail fast rather than hang
    max_retries=2,
    stop=None,
).with_structured_output(RoutingDecision)


def _format_history(state: AgentState) -> str:
    return "\n".join(f"{m.role}: {m.content}" for m in state["messages"])


def _format_selected_satellite(state: AgentState) -> str:
    sp = state.get("selected_pass")

    if sp is None:
        return "No satellite currently selected."
    return f"Currently selected satellite: {sp.satname} (NORAD {sp.satid})"


def orchestrator_node(state: AgentState) -> AgentState:
    prompt = (
        f"Conversation history:\n{_format_history(state)}\n\n"
        f"{_format_selected_satellite(state)}\n\n"
        f"Classify the latest message and produce a routing decision."
    )

    try:
        decision = cast(
            RoutingDecision,
            _router_model.invoke(
                [
                    SystemMessage(content=ORCHESTRATOR_SYSTEM_PROMPT),
                    HumanMessage(content=prompt),
                ]
            ),
        )

        state["routing"] = decision
    except Exception as e:
        # graceful fallback — never crash the graph on a bad classification
        last_message = state["messages"][-1].content if state["messages"] else ""
        state["routing"] = RoutingDecision(
            intent="all",
            agents_to_call=["satellite", "weather", "knowledge"],
            reasoning=f"Fallback due to classification error: {e}",
            resolved_query=last_message,
        )
        state["errors"] = [f"orchestrator_error: {e}"]

    return state
