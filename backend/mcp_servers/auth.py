"""
Shared auth + rate limiting for AstroWatch's MCP servers.

Auth model: opaque per-user API keys (sk-aw-<server>-<random>), stored
hashed in Supabase and issued/revoked from the frontend Developer page.
This is deliberately NOT JWT/OAuth for the astrowatch-* servers — that's
reserved for Calendar (Phase B), where we're a client of someone else's
auth server. Here, we ARE the auth server, and a simple looked-up opaque
token is the right amount of complexity for a handful of tools without
a real IdP behind them.
"""

import hashlib
import os
import time
from collections import defaultdict, deque

from dotenv import load_dotenv
from fastmcp.exceptions import ToolError
from fastmcp.server.auth import AccessToken, AuthProvider
from fastmcp.server.dependencies import get_access_token
from fastmcp.server.middleware import Middleware, MiddlewareContext
from supabase import Client as SupabaseClient
from rag.database import get_supabase

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

_supabase: SupabaseClient = get_supabase()


def _hash_key(raw_key: str) -> str:
    # Keys are never stored in plaintext — only this hash is persisted,
    # same principle as password storage. Lookup hashes the incoming
    # token and compares against the stored hash.
    return hashlib.sha256(raw_key.encode()).hexdigest()


class SupabaseAPIKeyVerifier(AuthProvider):
    """
    Validates the `Authorization: Bearer <key>` header against the
    mcp_api_keys table and returns an AccessToken FastMCP can attach
    to the request context (accessible in tools via get_access_token()).

    Expected table shape (mcp_api_keys):
        id, clerk_user_id, server_name, key_hash, revoked_at, created_at
    """

    def __init__(self, server_name: str):
        super().__init__(resource_base_url=None)
        self.server_name = server_name

    async def verify_token(self, token: str) -> AccessToken | None:
        key_hash = _hash_key(token)

        result = (
            _supabase.table("mcp_api_keys")
            .select("clerk_user_id, revoked_at")
            .eq("key_hash", key_hash)
            .eq("server_name", self.server_name)
            .maybe_single()
            .execute()
        )

        row = result.data if result else None

        if not isinstance(row, dict) or row.get("revoked_at") is not None:
            return None

        clerk_user_id = row.get("clerk_user_id")
        if not isinstance(clerk_user_id, str):
            return None

        return AccessToken(
            token=token,
            client_id=clerk_user_id,
            scopes=[self.server_name],
        )


class InMemoryRateLimiter:
    """
    Per-client_id sliding-window rate limit. Intentionally simple —
    this is the "30 minutes on Day 4" version, not a Redis-backed
    distributed limiter. Good enough for a single Render instance;
    call out in interviews as the first thing to swap for a real
    gateway (Kong/Cloudflare AI Gateway) if this were multi-instance.
    """

    def __init__(self, max_calls: int = 30, window_seconds: int = 60):
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._calls: dict[str, deque] = defaultdict(deque)

    def check(self, client_id: str) -> bool:
        now = time.monotonic()
        window = self._calls[client_id]

        while window and now - window[0] > self.window_seconds:
            window.popleft()

        if len(window) >= self.max_calls:
            return False

        window.append(now)
        return True


class RateLimitMiddleware(Middleware):
    def __init__(self, limiter: InMemoryRateLimiter):
        self.limiter = limiter

    async def on_call_tool(self, context: MiddlewareContext, call_next):
        access_token = get_access_token()
        client_id = access_token.client_id if access_token else "anonymous"

        if not self.limiter.check(client_id):
            raise ToolError(
                "Rate limit exceeded — max 30 calls/min per key. Try again shortly."
            )

        return await call_next(context)
