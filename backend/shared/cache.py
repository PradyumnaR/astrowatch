import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

log = logging.getLogger(__name__)

# Bump this if the shape of cached data changes, so old entries are ignored
CACHE_VERSION = "v1"


class TTL:
    """Cache lifetimes in seconds. One place to see and change them all."""

    WEATHER_CURRENT = 10 * 60  # Open-Meteo "right now" keeps it fresh
    WEATHER_HOURLY = 30 * 60  # Open-Meteo is hourly data
    N2YO_PASSES = 60 * 60  # predictions are stable for hours
    CELESTRAK = 2 * 60 * 60  # matches your existing Supabase cache window
    APOD = 24 * 60 * 60  # changes once a day
    EMBEDDING = 7 * 24 * 60 * 60  # same text + model → same vector; never goes stale
    RAG_RESULTS = (
        60 * 60
    )  # bounded staleness after ingestion (until 4d invalidates instantly)


def cache_key(*parts: object) -> str:
    """cache_key("n2yo", 25544, "34.18", "-118.31") -> 'cache:v1:n2yo:25544:34.18:-118.31'"""
    return ":".join(["cache", CACHE_VERSION, *(str(p) for p in parts)])


def round_coord(value: float) -> str:
    """~1 km precision, so nearby users share cache entries."""
    return f"{value:.2f}"


async def get_or_fetch(
    redis: Redis,
    key: str,
    ttl: int,
    fetch: Callable[[], Awaitable[Any]],
) -> Any:
    if ttl <= 0:
        raise ValueError("Cache entries must have a positive TTL")

    # 1. Try the cache. If Redis is down, treat it as a miss.
    try:
        cached = await redis.get(key)
    except RedisError as exc:
        log.warning("Cache read failed for %s: %s", key, exc)
        cached = None

    if cached is not None:
        log.debug("Cache hit: %s", key)
        return json.loads(cached)

    # 2. Miss: call the real API. If it raises, nothing gets cached.
    log.debug("Cache miss: %s", key)
    data = await fetch()

    # 3. Save for next time. Best-effort: a failed write never fails the request.
    try:
        await redis.set(key, json.dumps(data), ex=ttl)
    except RedisError as exc:
        log.warning("Cache write failed for %s: %s", key, exc)
    except TypeError:
        log.exception("Value for %s is not JSON-serializable; not cached", key)

    return data
