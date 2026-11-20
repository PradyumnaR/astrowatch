import os
import hashlib

from dotenv import load_dotenv
from voyageai.client_async import AsyncClient

from shared.cache import TTL, cache_key, get_or_fetch
from shared.redis_client import get_redis_client

load_dotenv()

voyage = AsyncClient(
    api_key=os.getenv("VOYAGE_API_KEY"),
    max_retries=2,  # retry transient network errors / rate limits
    timeout=20,  # never hang a chat turn (or an ingestion batch) on Voyage
)
EMBEDDING_MODEL = "voyage-3"
EMBEDDING_DIMS = 1024


def normalize_text(text: str) -> str:
    """Collapse whitespace so "Hubble  " and "Hubble" share one cache entry."""
    return " ".join(text.split())


async def embed_text(text: str) -> list[float] | list[int]:
    """
    Convert a single text string to a vector embedding.
    Used for query embeddings at search time.
    """

    text = normalize_text(text)
    digest = hashlib.sha256(text.encode()).hexdigest()
    key = cache_key("embed", EMBEDDING_MODEL, digest)

    async def fetch() -> list[float] | list[int]:
        result = await voyage.embed(texts=[text], model=EMBEDDING_MODEL)
        return result.embeddings[0]

    return await get_or_fetch(get_redis_client(), key, TTL.EMBEDDING, fetch)


async def embed_batch(texts: list[str]) -> list[list[float] | list[int]]:
    """
    Convert a list of texts to vector embeddings.
    Used for ingestion — more efficient than one at a time.
    Voyage handles batching internally up to 128 texts.
    """
    all_embedings = []
    batch_size = 128

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        result = await voyage.embed(texts=batch, model=EMBEDDING_MODEL)

        all_embedings.extend(result.embeddings)

    return all_embedings


def chunk_text(text: str, chunk_size: int = 100, overlap: int = 50) -> list[str]:
    """
    Split long text into overlapping chunks.
    Each chunk is ~500 words with 50 word overlap.

    Why overlap?
      Without overlap a sentence split across
      two chunks loses context at the boundary.
      Overlap ensures boundary sentences appear
      in both chunks preserving full context.

    Example with chunk_size=5, overlap=2:
      text:    [1, 2, 3, 4, 5, 6, 7, 8]
      chunk 1: [1, 2, 3, 4, 5]
      chunk 2: [4, 5, 6, 7, 8]  ← 4,5 repeated
    """

    words = text.split()
    chunks = []
    start = 0

    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)

        start += chunk_size - overlap

        if end >= len(words):
            break

    return chunks


def clean_text(text: str) -> str:
    """
    Clean text before embedding.
    Removes HTML tags, extra whitespace,
    and other noise that hurts embedding quality.
    """
    import re

    # remove HTML tags
    text = re.sub(r"<[^>]+>", "", text)

    # remove URLs
    text = re.sub(r"http\S+|www\S+", "", text)

    # remove extra whitespace
    text = re.sub(r"\s+", " ", text)

    # remove special characters but keep
    # punctuation that helps with meaning
    text = re.sub(r"[^\w\s\.,!?;:\-\'\"()]", "", text)

    return text.strip()
