"""
astrowatch-knowledge — MCP server exposing the RAG knowledge base
(Voyage embeddings + Supabase pgvector, ingested from NASA APOD,
Spaceflight News, and Wikipedia).

Wraps agents/knowledge.py::search_knowledge_base directly, including
its norad_id -> satellite-name query enrichment (e.g. norad_id=25544
gets "ISS International Space Station" prepended to the query before
embedding) — same behavior your own chat agent's knowledge_node uses.

Two tools:
- search_space_knowledge: general-purpose search, matches
  search_knowledge_base's real signature 1:1
- get_satellite_info: a thin convenience wrapper — NOT new backend
  logic, just search_space_knowledge pre-seeded with a generic query
  for a given norad_id, so an external client doesn't have to guess
  what query string gets useful background info

Auth + rate limiting: same pattern as the other two servers.
"""

from typing import Annotated

from fastmcp import FastMCP
from pydantic import Field

from mcp_servers.auth import (
    InMemoryRateLimiter,
    RateLimitMiddleware,
    SupabaseAPIKeyVerifier,
)
from agents.knowledge import search_knowledge_base as _search_knowledge_base

auth = SupabaseAPIKeyVerifier(server_name="knowledge")
mcp = FastMCP(name="astrowatch-knowledge", auth=auth)
mcp.add_middleware(
    RateLimitMiddleware(InMemoryRateLimiter(max_calls=30, window_seconds=60))
)


def _serialize_chunks(chunks: list[dict]) -> list[dict]:
    # Return structured data rather than the pre-formatted Claude-facing
    # string (format_chunks_for_claude) — an external MCP client should
    # decide its own presentation, not inherit AstroWatch's internal
    # chat-prompt formatting.
    return [
        {
            "content": c.get("content", ""),
            "source": c.get("source", "unknown"),
            "title": c.get("metadata", {}).get("title", ""),
            "url": c.get("metadata", {}).get("url", ""),
            "similarity": c.get("similarity"),
        }
        for c in chunks
    ]


@mcp.tool()
async def search_space_knowledge(
    query: Annotated[
        str,
        Field(
            description="Natural-language search query, e.g. 'why does the ISS orbit decay'"
        ),
    ],
    limit: Annotated[
        int, Field(description="Max number of chunks to return", ge=1, le=10)
    ] = 3,
    norad_id: Annotated[
        int | None,
        Field(
            description="Optional NORAD ID — if provided, the satellite's name is prepended to the query for better matches"
        ),
    ] = None,
    filter_source: Annotated[
        str | None,
        Field(
            description="Optional source filter: 'nasa_apod', 'spaceflight_news', or 'wikipedia'"
        ),
    ] = None,
) -> dict:
    """
    Semantic search over AstroWatch's space knowledge base (NASA APOD,
    Spaceflight News, Wikipedia — embedded with Voyage AI, searched via
    Supabase pgvector). Returns the most relevant chunks for the query.
    """
    chunks = await _search_knowledge_base(
        query=query, limit=limit, filter_source=filter_source, norad_id=norad_id
    )
    return {"query": query, "chunks": _serialize_chunks(chunks)}


@mcp.tool()
async def get_satellite_info(
    norad_id: Annotated[
        int,
        Field(description="NORAD catalog ID of the satellite, e.g. 25544 for the ISS"),
    ],
    limit: Annotated[
        int, Field(description="Max number of chunks to return", ge=1, le=10)
    ] = 3,
) -> dict:
    """
    Get general background info about a specific satellite by NORAD ID
    — convenience wrapper around search_space_knowledge with a generic
    'overview and background' query, so callers don't need to guess a
    good search string just to learn what a satellite is.
    """
    chunks = await _search_knowledge_base(
        query="overview, mission, and background", limit=limit, norad_id=norad_id
    )
    return {"norad_id": norad_id, "chunks": _serialize_chunks(chunks)}


if __name__ == "__main__":
    # Local dev: `python -m mcp_servers.knowledge_server` from backend/.
    mcp.run()
