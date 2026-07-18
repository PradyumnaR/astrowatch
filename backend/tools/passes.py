import httpx
import os
from dotenv import load_dotenv

load_dotenv()

N2YO_API_KEY = os.getenv("N2YO_API_KEY")


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
    url = (
        f"https://api.n2yo.com/rest/v1/satellite"
        f"/visualpasses/{norad_id}/{lat}/{lng}/0/{days}/30"
        f"/&apiKey={N2YO_API_KEY}"
    )

    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()

    passes = data.get("passes", []) or []
    info = data.get("info", {})

    enriched = [
        {
            **p,
            "satid": info.get("satid"),
            "satname": info.get("satname"),
        }
        for p in passes[:5]
    ]

    return {
        "satname": info.get("satname", "Unknown"),
        "satid": norad_id,
        "passescount": info.get("passescount", 0),
        "passes": enriched,
    }
