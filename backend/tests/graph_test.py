from dotenv import load_dotenv

load_dotenv()  # ← must run BEFORE importing anything that builds a ChatAnthropic client
# backend/scripts/test_graph.py
import asyncio

from agents.graph.graph import compiled_graph  # adjust to your actual filename
from agents.models import ChatMessage, Location, SatellitePass
from agents.graph.state import AgentState


async def test():
    # simulate a prior turn establishing context + a follow-up
    messages = [
        ChatMessage(role="user", content="When can I see the ISS tonight?"),
        ChatMessage(role="assistant", content="ISS passes at 9:14 PM, 78° elevation."),
        ChatMessage(
            role="user",
            content="Plan my ISS viewing this week and tell me about recent missions",
        ),
    ]

    location = Location(
        lat=34.1808, lng=-118.3090, name="Burbank, CA", timezone="America/Los_Angeles"
    )

    selected_pass = SatellitePass(
        satid=25544,
        satname="ISS",
        startAz=45.0,
        startAzCompass="NE",
        startEl=10.0,
        startUTC=1753300000,  # replace with a real near-future unix timestamp
        maxAz=180.0,
        maxEl=78.0,
        maxUTC=1753300300,
        endAz=270.0,
        endUTC=1753300600,
        mag=-2.5,
        duration=360,
    )

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

    print("\n--- ROUTING ---")
    print(result.get("routing"))
    print("\n--- FINAL RESPONSE ---")
    print(result.get("final_response"))
    print("\n--- TOOLS USED ---")
    print(result.get("tools_used"))
    print("\n--- ERRORS ---")
    print(result.get("errors"))


if __name__ == "__main__":
    asyncio.run(test())
