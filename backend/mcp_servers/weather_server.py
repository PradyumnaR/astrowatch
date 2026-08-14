"""
astrowatch-weather — MCP server exposing viewing-conditions data.

Wraps the existing tools/weather.py Open-Meteo logic (used internally
by the LangGraph weather_node) so external MCP clients can check sky
conditions the same way AstroWatch's own chat agent does.

Two tools, matching the two real functions that already exist:
- get_viewing_conditions: current conditions (tools.weather.get_weather)
- get_weather_at_time: conditions at a specific future UTC timestamp
  (tools.weather.get_weather_at_time) — this is the one that actually
  matters for satellite watching, since a pass is almost always hours
  or days out, not "right now."

Auth + rate limiting: same pattern as astrowatch-satellite (see
mcp_servers/auth.py) — opaque per-user API key, 30 calls/min/key.
"""

from typing import Annotated, Optional

from fastmcp import FastMCP
from pydantic import Field

from mcp_servers.auth import (
    InMemoryRateLimiter,
    RateLimitMiddleware,
    SupabaseAPIKeyVerifier,
)
from tools.weather import get_weather as _get_weather
from tools.weather import get_weather_at_time as _get_weather_at_time

auth = SupabaseAPIKeyVerifier(server_name="weather")
mcp = FastMCP(name="astrowatch-weather", auth=auth)
mcp.add_middleware(
    RateLimitMiddleware(limiter=InMemoryRateLimiter(max_calls=30, window_seconds=60))
)


@mcp.tool()
async def get_viewing_conditions(
    lat: Annotated[float, Field(description="Observer latitude, decimal degrees")],
    lng: Annotated[float, Field(description="Observer longitude, decimal degrees")],
    timezone: Annotated[
        str, Field(description="Observer timezone, e.g. 'America/New_York'")
    ] = "auto",
) -> dict:
    """
    Get CURRENT weather conditions at a location — cloud cover (%),
    temperature (°F), and wind speed (mph). Use get_weather_at_time
    instead whenever you have a specific future pass time to check,
    since "current" conditions are frequently wrong for a pass that's
    hours or days away.
    """
    return await _get_weather(lat=lat, lng=lng, timezone=timezone)


@mcp.tool()
async def get_weather_at_time(
    lat: Annotated[float, Field(description="Observer latitude, decimal degrees")],
    lng: Annotated[float, Field(description="Observer longitude, decimal degrees")],
    target_utc: Annotated[int, Field(description="Target UTC timestamp")],
    forecast_days: Annotated[int, Field(description="Number of days to forecast")],
) -> dict:
    """
    Get weather conditions at a specific future UTC timestamp.
    """
    return await _get_weather_at_time(
        lat=lat, lng=lng, target_utc=target_utc, forecast_days=forecast_days
    )


if __name__ == "__main__":
    # Local dev: `python -m mcp_servers.weather_server` from backend/,
    # same pattern as satellite_server.py — see that file's comments
    # for why -m (not a direct path) matters here.
    mcp.run()
