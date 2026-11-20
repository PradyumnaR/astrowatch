from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

_http: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    if _http is None:
        raise RuntimeError("HTTP client not initialized. Is http_lifespan registered?")
    return _http


@asynccontextmanager
async def http_lifespan(app: FastAPI):
    global _http
    _http = httpx.AsyncClient(
        follow_redirects=True,  # you needed this before
        timeout=httpx.Timeout(10.0, connect=3.0),  # never hang on an upstream
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
    )
    try:
        yield
    finally:
        await _http.aclose()
        _http = None
