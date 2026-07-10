# rag/search.py

from rag.embeddings import embed_text
from rag.database import search_knowledge as db_search


async def search(
    query: str,
    limit: int = 3,
    match_threshold: float = 0.45,
    filter_source: str | None = None,
) -> list[dict]:
    """
    High level search function.
    Embeds query then searches pgvector.
    """
    query_embedding = await embed_text(query)

    results = await db_search(
        query_embedding=query_embedding,
        match_threshold=match_threshold,
        match_count=limit,
        filter_source=filter_source,
    )

    return results
