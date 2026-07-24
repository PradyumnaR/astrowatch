"""
Week 3 chat entrypoint — routes through the LangGraph multi-agent
system instead of the Week 2 manual tool loop (see chat.py for v1).
"""

from dotenv import load_dotenv

load_dotenv()  # must run before importing anything that builds a ChatAnthropic client

from agents.graph.graph import compiled_graph
from agents.graph.state import AgentState
from agents.models import ChatMessage, Location, SatellitePass


async def chat_with_tools_v2(
    messages: list[ChatMessage],
    location: Location | None = None,
    selected_pass: SatellitePass | None = None,
) -> dict:
    """
    Chat using the LangGraph multi-agent system.

    Flow:
    1. Orchestrator classifies intent + resolves multi-turn references
    2. Fans out to Satellite / Weather / Knowledge agents as needed (parallel)
    3. Report Writer synthesizes all outputs into one response
    """

    print(f"\nChat v2 started — {len(messages)} messages")

    initial_state: AgentState = {
        "messages": messages,
        "location": location,
        "selected_pass": selected_pass,
        "routing": None,
        "passes_data": None,
        "weather_data": None,
        "knowledge_data": None,
        "tools_used": [],
        "sources": [],
        "errors": [],
        "final_response": None,
    }

    result = await compiled_graph.ainvoke(initial_state)

    routing = result.get("routing")
    print(
        f"Routing: {routing.intent if routing else 'unknown'} -> {routing.agents_to_call if routing else []}"
    )
    print(f"Tools used: {result.get('tools_used', [])}")
    if result.get("errors"):
        print(f"Errors: {result['errors']}")

    return {
        "content": result.get("final_response")
        or "I couldn't generate a response. Please try again.",
        "sources": result.get("sources", []),
        "toolsUsed": result.get("tools_used", []),
    }
