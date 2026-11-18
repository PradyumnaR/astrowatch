import logging
import os

from collections.abc import Iterable
from contextlib import asynccontextmanager
from fastapi import FastAPI
from langgraph.checkpoint.redis.ashallow import AsyncShallowRedisSaver
from collections.abc import Iterable
from langgraph.checkpoint.redis.jsonplus_redis import JsonPlusRedisSerializer

log = logging.getLogger(__name__)


# 7 days, in MINUTES (this library's TTL unit), reset each time a thread is read
CHECKPOINT_TTL = {"default_ttl": 7 * 24 * 60, "refresh_on_read": True}

_checkpointer: AsyncShallowRedisSaver | None = None


def build_serializer(types: Iterable[type]) -> JsonPlusRedisSerializer:
    """Redis stores graph state as JSON. On load, a Pydantic model is only
    rebuilt as its real class if it's in this allowlist; anything else
    comes back as a plain dict (a deliberate security restriction)."""
    return JsonPlusRedisSerializer(
        allowed_json_modules=[(*t.__module__.split("."), t.__name__) for t in types]
    )


def get_checkpointer() -> AsyncShallowRedisSaver:
    if _checkpointer is None:
        raise RuntimeError(
            "Checkpointer not initialized. Is checkpointer_lifespan registered?"
        )
    return _checkpointer


@asynccontextmanager
async def checkpointer_lifespan(app: FastAPI):
    global _checkpointer
    async with AsyncShallowRedisSaver.from_conn_string(
        os.environ["REDIS_URL"], ttl=CHECKPOINT_TTL
    ) as saver:
        await saver.asetup()  # creates the search indices it needs
        _checkpointer = saver
        log.info("Checkpointer ready")
        try:
            yield
        finally:
            _checkpointer = None
