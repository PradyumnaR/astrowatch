from anthropic.types import ToolParam
from pydantic import BaseModel, Field


# ── Tool input schemas (Pydantic) ─────────────────────
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


def make_tool(name: str, description: str, model: type[BaseModel]) -> ToolParam:
    return ToolParam(
        name=name, description=description, input_schema=model.model_json_schema()
    )


TOOLS: list[ToolParam] = [
    make_tool(
        name="get_satellite_passes",
        description=(
            "Get upcoming visible satellite passes for an observer location. "
            "Use this when user asks about when they can see a satellite, "
            "pass times, viewing opportunities, or when a satellite is overhead."
        ),
        model=PassesInput,
    ),
    make_tool(
        name="get_weather",
        description=(
            "Get current weather conditions at observer location. "
            "Use this when user asks about viewing conditions, "
            "cloud cover, whether tonight is good for satellite watching."
        ),
        model=WeatherInput,
    ),
    make_tool(
        name="search_knowledge",
        description=(
            "Search the AstroWatch knowledge base for information about "
            "satellites, space missions, astronomy concepts, and recent "
            "space news. Use this when user asks what a satellite does, "
            "its history, mission details, or any space facts."
        ),
        model=KnowledgeInput,
    ),
]
