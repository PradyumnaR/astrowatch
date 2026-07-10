import os
from unittest import result
from supabase import create_client, Client
from dotenv import load_dotenv
import supabase

load_dotenv()

# initialize Supabase client once
# reused across all database calls
_supabase: Client | None = None


def get_supabase() -> Client:
    global _supabase

    if _supabase is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")

        if not url or not key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY " "must be set in .env"
            )

        _supabase = create_client(url, key)

    return _supabase


async def insert_chunk(
    content: str,
    embedding: list[float] | list[int],
    source: str,
    category: str,
    metadata: dict,
) -> dict:
    """
    Insert a single knowledge chunk into Supabase.
    Returns the inserted row.
    """
    supabase = get_supabase()

    result = (
        supabase.table("knowledge_chunks")
        .insert(
            {
                "content": content,
                "embedding": embedding,
                "source": source,
                "category": category,
                "metadata": metadata,
            }
        )
        .execute()
    )
    return result.data[0] if result.data else {}


async def insert_chunks_batch(
    chunks: list[dict],
) -> int:
    """
    Insert multiple knowledge chunks at once.
    More efficient than inserting one at a time.

    Each chunk dict should have:
      content, embedding, source, category, metadata
    """
    supabase = get_supabase()

    if not chunks:
        return 0

    result = supabase.table("knowledge_chunks").insert(chunks).execute()

    return len(result.data) if result.data else 0


async def search_knowledge(
    query_embedding: list[float] | list[int],
    match_threshold: float = 0.5,
    match_count: int = 5,
    filter_source: str | None = None,
) -> list[dict]:
    """
    Search knowledge base using vector similarity.
    Calls the match_knowledge() SQL function we created.
    """
    supabase = get_supabase()

    result = supabase.rpc(
        "match_knowledge",
        {
            "query_embedding": query_embedding,
            "match_threshold": match_threshold,
            "match_count": match_count,
            "filter_source": filter_source,
        },
    ).execute()

    return result.data if result.data else []


async def chunk_exists(source: str, metadata: dict) -> bool:
    """
    Check if a chunk already exists in the database.
    Prevents duplicate ingestion of the same article.

    Uses metadata URL or date as unique identifier.
    """
    supabase = get_supabase()

    url = metadata.get("url") or metadata.get("date")

    if not url:
        return False

    result = (
        supabase.table("knowledge_chunks")
        .select("id")
        .eq("source", source)
        .eq("metadata->>url", url)
        .limit(1)
        .execute()
    )

    return len(result.data) > 0


async def delete_chunks_by_source(source: str) -> int:
    """
    Delete all chunks for a given source.
    Useful for re-ingesting fresh data.
    """
    supabase = get_supabase()

    result = supabase.table("knowledge_chunks").delete().eq("source", source).execute()

    return len(result.data) if result.data else 0


async def get_chunk_count(source: str | None = None) -> int:
    """
    Get total number of chunks in knowledge base.
    Optional filter by source.
    """
    supabase = get_supabase()

    query = supabase.table("knowledge_chunks").select("id")

    if source:
        query = query.eq("source", source)

    result = query.execute()
    return len(result.data) if result.data else 0
