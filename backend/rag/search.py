# rag/search.py

import hashlib
import os

from redis.exceptions import RedisError

from rag.database import (
    hybrid_search_knowledge as db_hybrid_search,
    search_knowledge as db_search,
)
from rag.embeddings import EMBEDDING_MODEL, embed_text, normalize_text
from shared.cache import TTL, cache_key, get_or_fetch
from shared.redis_client import get_redis_client

# Bumped whenever the knowledge base changes (ingestion, step 4d), which
# makes every cached search result unreachable at once. Until then it
# stays 0 and cached results simply expire after TTL.RAG_RESULTS.
KB_VERSION_KEY = "kb:version"


async def get_kb_version() -> int:
    try:
        value = await get_redis_client().get(KB_VERSION_KEY)
        return int(value or 0)
    except RedisError:
        return 0


async def search(
    query: str,
    limit: int = 3,
    match_threshold: float = 0.45,
    filter_source: str | None = None,
) -> list[dict]:
    """
    High level search function.
    Embeds query then searches pgvector. Results are cached per
    (knowledge base version, mode, parameters, query).
    """
    query = normalize_text(query)
    mode = os.getenv("RAG_SEARCH_MODE", "vector")
    kb_version = await get_kb_version()

    if mode == "hybrid":
        try:
            return await _cached_search(
                "hybrid", query, limit, match_threshold, filter_source, kb_version
            )
        except Exception as e:
            # Never let the new path take retrieval down — fall back.
            print(f"hybrid_search_failed, falling back to vector: {e}")

    return await _cached_search(
        "vector", query, limit, match_threshold, filter_source, kb_version
    )


async def _cached_search(
    mode: str,
    query: str,
    limit: int,
    match_threshold: float,
    filter_source: str | None,
    kb_version: int,
) -> list[dict]:
    digest = hashlib.sha256(query.encode()).hexdigest()
    key = cache_key(
        "rag",
        f"kb{kb_version}",
        mode,
        EMBEDDING_MODEL,
        limit,
        match_threshold,
        filter_source or "all",
        digest,
    )

    async def fetch() -> list[dict]:
        query_embedding = await embed_text(query)  # itself cached (4b)
        if mode == "hybrid":
            return await db_hybrid_search(
                query=query,
                query_embedding=query_embedding,
                match_threshold=match_threshold,
                match_count=limit,
                filter_source=filter_source,
            )
        return await db_search(
            query_embedding=query_embedding,
            match_threshold=match_threshold,
            match_count=limit,
            filter_source=filter_source,
        )

    return await get_or_fetch(get_redis_client(), key, TTL.RAG_RESULTS, fetch)
