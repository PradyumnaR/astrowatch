from agents.knowledge import (
    search_knowledge_base,
    format_chunks_for_claude,
)


async def search_knowledge(
    query: str,
    limit: int = 3,
    norad_id: int | None = None,
) -> str:
    """
    Search knowledge base and return
    formatted string for Claude to read.
    """
    chunks = await search_knowledge_base(
        query=query,
        limit=limit,
        norad_id=norad_id,
    )

    return format_chunks_for_claude(chunks)
