import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

log = logging.getLogger(__name__)

_redis: Redis | None = None


def create_redis() -> Redis:
    return Redis.from_url(
        os.environ["REDIS_URL"],
        decode_responses=True,  # return str, not bytes
        socket_connect_timeout=2,  # fail fast if Redis is unreachable
        socket_timeout=2,  # never let a slow Redis hang a request
        health_check_interval=30,  # detect dead pooled connections
        retry_on_timeout=True,
    )


def get_redis_client() -> Redis:
    """Use anywhere: nodes, MCP tools, helpers."""
    if _redis is None:
        raise RuntimeError("Redis not initialized. Is redis_lifespan registered?")
    return _redis


@asynccontextmanager
async def redis_lifespan(app: FastAPI):
    global _redis
    _redis = create_redis()
    try:
        await _redis.ping()
        log.info("Redis connected")
    except RedisError as exc:
        # Don't crash startup: the cache is best-effort, so the app still works without it
        log.warning("Redis unavailable at startup: %s", exc)
    app.state.redis = _redis
    try:
        yield
    finally:
        await _redis.aclose()
        _redis = None


def get_redis(request: Request) -> Redis:
    """FastAPI dependency: the shared Redis client."""
    return request.app.state.redis
