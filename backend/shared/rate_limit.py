"""
Per-user rate limiting backed by Redis (fixed window).

Shared across every backend instance (workers now, pods later), unlike an
in-process counter. Keyed by the verified Clerk user id, never by
anything the client sends.
"""

import logging
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from redis.exceptions import RedisError

from auth import require_user
from shared.redis_client import get_redis_client

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class RateLimit:
    name: str
    limit: int  # max requests per window
    window_seconds: int


# One place to see and change limits. Later: vary by plan (standard/pro).
CHAT_RATE_LIMIT = RateLimit(name="chat", limit=20, window_seconds=60)


async def seconds_until_allowed(rule: RateLimit, user_id: str) -> int | None:
    """Counts this request. Returns how long to wait if over the limit, else None."""
    key = f"ratelimit:{rule.name}:{user_id}"
    try:
        async with get_redis_client().pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, rule.window_seconds, nx=True)  # start the window once
            pipe.ttl(key)
            count, _, ttl = await pipe.execute()
    except RedisError as exc:
        # Fail open: a limiter outage shouldn't block every user
        log.warning("Rate limit check failed, allowing request: %s", exc)
        return None

    if count > rule.limit:
        return max(int(ttl), 1)
    return None


async def chat_rate_limit(clerk_user_id: str = Depends(require_user)) -> None:
    """FastAPI dependency for the chat endpoints."""
    retry_after = await seconds_until_allowed(CHAT_RATE_LIMIT, clerk_user_id)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many messages. Please wait a moment.",
            headers={"Retry-After": str(retry_after)},
        )
