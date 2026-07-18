import json

from pydantic import BaseModel, Field
from agents.models import ChatMessage, SatellitePass, Location
from tools.knowledge import search_knowledge
from tools.weather import get_weather
from tools.passes import get_satellite_passes


class PassesInput(BaseModel):
    norad_id: int = Field(..., description="NORAD catalog ID of the satellite")
    lat: float = Field(..., description="Observer latitude")
    lng: float = Field(..., description="Observer longitude")
    days: int = Field(3, description="Number of days to look ahead (1-7)")


class WeatherInput(BaseModel):
    lat: float = Field(..., description="Observer latitude")
    lng: float = Field(..., description="Observer longitude")


class KnowledgeInput(BaseModel):
    query: str = Field(..., description="Search query about space or satellites")
    norad_id: int | None = Field(
        None, description="Optional NORAD ID to focus search on specific satellite"
    )
    limit: int = Field(3, description="Number of results to return (1-5)")


async def execute_tool(
    tool_name: str,
    tool_input: dict,
    location: Location | None,
    norad_id: int | None,
) -> str:
    """
    Execute a single tool call from Claude.
    Validates input with Pydantic then calls the tool.
    Returns result as string for Claude to read.
    """

    print(f"  → Tool: {tool_name}")
    print(f"    Input: {json.dumps(tool_input)}")

    try:
        if tool_name == "get_satellite_passes":
            params = PassesInput(**tool_input)
            result = await get_satellite_passes(
                norad_id=params.norad_id,
                lat=params.lat,
                lng=params.lng,
                days=params.days,
            )
            return json.dumps(result, indent=2)

        elif tool_name == "get_weather":
            params = WeatherInput(**tool_input)
            result = await get_weather(
                lat=params.lat,
                lng=params.lng,
            )
            return json.dumps(result, indent=2)
        elif tool_name == "search_knowledge":
            params = KnowledgeInput(**tool_input)
            result = await search_knowledge(
                query=params.query,
                limit=params.limit,
                norad_id=params.norad_id or norad_id,
            )
            return result
        else:
            return f"Unknown tool: {tool_name}"

    except Exception as e:
        print(f"    Error: {e}")
        return f"Tool {tool_name} failed: {str(e)}"
