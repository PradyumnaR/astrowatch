"""
astrowatch-satellite — MCP server exposing satellite pass data.

Wraps the existing tools/passes.py N2YO logic (used internally by the
LangGraph satellite_node) so external MCP clients — Claude Desktop,
Cursor, or anyone with an issued API key — can call the same data
without going through AstroWatch's own chat UI.

Auth: opaque per-user API key, validated against Supabase (see auth.py).
Transport: Streamable HTTP, mounted at /mcp/satellite in main.py.
Rate limit: 30 calls/min/key (see auth.py — first thing to swap for a
real gateway if this server ever runs on more than one instance).
"""

import os

import httpx
from fastmcp import FastMCP
from pydantic import Field
from typing import Annotated

from mcp_servers.auth import (
    InMemoryRateLimiter,
    RateLimitMiddleware,
    SupabaseAPIKeyVerifier,
)
from tools.passes import get_satellite_passes as _get_satellite_passes

N2YO_API_KEY = os.getenv("N2YO_API_KEY")

auth = SupabaseAPIKeyVerifier(server_name="satellite")
mcp = FastMCP(name="astrowatch-satellite", auth=auth)
mcp.add_middleware(
    RateLimitMiddleware(InMemoryRateLimiter(max_calls=30, window_seconds=60))
)


@mcp.tool()
async def get_satellite_passes(
    norad_id: Annotated[
        int,
        Field(description="NORAD catalog ID of the satellite, e.g. 25544 for the ISS"),
    ],
    lat: Annotated[float, Field(description="Observer latitude, decimal degrees")],
    lng: Annotated[float, Field(description="Observer longitude, decimal degrees")],
    days: Annotated[
        int, Field(description="Number of days to look ahead (1-7)", ge=1, le=7)
    ] = 3,
) -> dict:
    """
    Get upcoming visible passes for a satellite at a given observer
    location. Returns start/max/end azimuth, elevation, and UTC time
    for each pass, sorted by date.
    """
    return await _get_satellite_passes(norad_id=norad_id, lat=lat, lng=lng, days=days)


@mcp.tool()
async def get_visible_satellites(
    lat: Annotated[float, Field(description="Observer latitude, decimal degrees")],
    lng: Annotated[float, Field(description="Observer longitude, decimal degrees")],
    category: Annotated[
        int,
        Field(
            description=(
                "N2YO category ID to filter by (0 = all, 2 = weather, "
                "3 = stations, 18 = amateur radio, 52 = starlink). "
                "Use 0 unless the caller asks for a specific type."
            )
        ),
    ] = 0,
) -> dict:
    """
    List satellites currently above the observer's location right now
    (N2YO's "above" endpoint). Useful for "what's up there right now"
    style questions, as distinct from get_satellite_passes which needs
    a specific NORAD ID and looks ahead in time.
    """
    url = (
        f"https://api.n2yo.com/rest/v1/satellite/above/"
        f"{lat}/{lng}/0/70/{category}/&apiKey={N2YO_API_KEY}"
    )

    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()

    above = data.get("above", []) or []
    info = data.get("info", {})

    return {
        "satcount": info.get("satcount", len(above)),
        "satellites": [
            {
                "satid": s.get("satid"),
                "satname": s.get("satname"),
                "elevation": s.get("satalt"),
                "azimuth": s.get("satazimuth"),
            }
            for s in above
        ],
    }


if __name__ == "__main__":
    # Local dev only — hits the MCP Inspector via stdio.
    # Production mounting (Streamable HTTP) happens in main.py, see below.
    mcp.run()
