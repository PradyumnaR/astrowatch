import httpx
import os
import time
from dotenv import load_dotenv

from shared.errors import UpstreamError
from shared.http_client import get_http_client
from shared.cache import get_or_fetch, cache_key, round_coord, TTL
from shared.redis_client import get_redis_client


load_dotenv()

N2YO_API_KEY = os.getenv("N2YO_API_KEY")
N2YO_BASE = "https://api.n2yo.com/rest/v1/satellite"
MIN_VISIBILITY_SECONDS = 30
MAX_PASSES_RETURNED = 5


async def _fetch_visual_passes(norad_id: int, lat: str, lng: str, days: int) -> dict:
    """Raw N2YO call. Raises on any failure, so errors are never cached."""
    url = (
        f"{N2YO_BASE}/visualpasses/{norad_id}/{lat}/{lng}/0/{days}"
        f"/{MIN_VISIBILITY_SECONDS}/&apiKey={N2YO_API_KEY}"
    )
    response = await get_http_client().get(url)
    response.raise_for_status()
    data = response.json()

    if data.get("error"):
        raise UpstreamError(f"N2YO visualpasses: {data['error']}")

    return {"info": data.get("info") or {}, "passes": data.get("passes") or []}


async def get_satellite_passes(
    norad_id: int,
    lat: float,
    lng: float,
    days: int = 7,
) -> dict:
    """
    Fetch visible passes for a satellite from N2YO.
    Returns upcoming passes with timing and elevation.
    """
    lat_r, lng_r = round_coord(lat), round_coord(lng)
    key = cache_key(
        "n2yo", "visualpasses", norad_id, lat_r, lng_r, days, MIN_VISIBILITY_SECONDS
    )

    raw = await get_or_fetch(
        get_redis_client(),
        key,
        TTL.N2YO_PASSES,
        lambda: _fetch_visual_passes(norad_id, lat_r, lng_r, days),
    )

    # Cached data can be up to an hour old: drop passes that already ended
    now = int(time.time())
    upcoming = [p for p in raw["passes"] if p.get("endUTC", 0) > now]
    info = raw["info"]

    enriched = [
        {**p, "satid": info.get("satid"), "satname": info.get("satname")}
        for p in upcoming[:MAX_PASSES_RETURNED]
    ]

    return {
        "satname": info.get("satname", "Unknown"),
        "satid": norad_id,
        "passescount": len(upcoming),
        "passes": enriched,
    }
