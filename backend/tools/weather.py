"""Open-Meteo weather fetching — current conditions and time-targeted forecast."""

import httpx
from datetime import datetime, timezone as dt_timezone


async def get_weather(lat: float, lng: float, timezone: str = "auto") -> dict:
    """
    Fetch CURRENT weather conditions from Open-Meteo.
    Use this only when there's no specific future time to check against.
    """

    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        "&current=cloud_cover,temperature_2m,wind_speed_10m"
        "&temperature_unit=fahrenheit"
        f"&wind_speed_unit=mph&timezone={timezone}"
    )

    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()

    current = data.get("current", {})

    return {
        "cloud_cover": current.get("cloud_cover", 20),
        "temperature": current.get("temperature_2m", 65),
        "wind_speed": current.get("wind_speed_10m", 5),
    }


async def get_weather_at_time(
    lat: float,
    lng: float,
    target_utc: int,
    forecast_days: int = 7,
) -> dict:
    """
    Fetch HOURLY forecast and return conditions closest to target_utc
    (a unix timestamp in seconds). Handles passes tonight, tomorrow,
    or several days out — up to `forecast_days` (Open-Meteo supports
    up to 16; we default to 7 to match the max pass-lookahead window).
    """
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        "&hourly=cloud_cover,temperature_2m,wind_speed_10m"
        "&temperature_unit=fahrenheit&wind_speed_unit=mph"
        f"&timezone=UTC&forecast_days={forecast_days}"
    )

    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()

    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    cloud_covers = hourly.get("cloud_cover", [])
    temps = hourly.get("temperature_2m", [])
    winds = hourly.get("wind_speed_10m", [])

    if not times:
        raise ValueError("No hourly data returned from Open-Meteo")

    target_dt = datetime.fromtimestamp(target_utc, tz=dt_timezone.utc)

    # find the hourly timestamp closest to the pass time
    best_idx = 0
    best_diff = None
    for i, t in enumerate(times):
        t_dt = datetime.fromisoformat(t).replace(tzinfo=dt_timezone.utc)
        diff = abs((t_dt - target_dt).total_seconds())
        if best_diff is None or diff < best_diff:
            best_diff = diff
            best_idx = i

    return {
        "cloud_cover": cloud_covers[best_idx] if best_idx < len(cloud_covers) else 20,
        "temperature": temps[best_idx] if best_idx < len(temps) else 65,
        "wind_speed": winds[best_idx] if best_idx < len(winds) else 5,
        "forecast_time": times[best_idx],
    }
