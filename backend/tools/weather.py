"""Open-Meteo weather fetching — current conditions and time-targeted forecast."""

from datetime import datetime, timezone as dt_timezone

from shared.cache import TTL, cache_key, get_or_fetch, round_coord
from shared.http_client import get_http_client
from shared.redis_client import get_redis_client

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def get_weather(lat: float, lng: float, timezone: str = "auto") -> dict:
    """
    Fetch CURRENT weather conditions from Open-Meteo.
    Use this only when there's no specific future time to check against.
    """
    lat_r, lng_r = round_coord(lat), round_coord(lng)
    key = cache_key("openmeteo", "current", lat_r, lng_r, timezone)

    async def fetch() -> dict:
        response = await get_http_client().get(
            OPEN_METEO_URL,
            params={
                "latitude": lat_r,
                "longitude": lng_r,
                "current": "cloud_cover,temperature_2m,wind_speed_10m",
                "temperature_unit": "fahrenheit",
                "wind_speed_unit": "mph",
                "timezone": timezone,
            },
        )
        response.raise_for_status()
        current = response.json().get("current") or {}
        return {
            "cloud_cover": current.get("cloud_cover", 20),
            "temperature": current.get("temperature_2m", 65),
            "wind_speed": current.get("wind_speed_10m", 5),
        }

    return await get_or_fetch(get_redis_client(), key, TTL.WEATHER_CURRENT, fetch)


async def _get_hourly_forecast(lat_r: str, lng_r: str, forecast_days: int) -> dict:
    """Hourly forecast for a location, cached. Shared by every target time."""
    key = cache_key("openmeteo", "hourly", lat_r, lng_r, forecast_days)

    async def fetch() -> dict:
        response = await get_http_client().get(
            OPEN_METEO_URL,
            params={
                "latitude": lat_r,
                "longitude": lng_r,
                "hourly": "cloud_cover,temperature_2m,wind_speed_10m",
                "temperature_unit": "fahrenheit",
                "wind_speed_unit": "mph",
                "timezone": "UTC",
                "forecast_days": forecast_days,
            },
        )
        response.raise_for_status()
        hourly = response.json().get("hourly") or {}
        if not hourly.get("time"):
            raise ValueError("No hourly data returned from Open-Meteo")  # never cached
        return hourly

    return await get_or_fetch(get_redis_client(), key, TTL.WEATHER_HOURLY, fetch)


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
    lat_r, lng_r = round_coord(lat), round_coord(lng)
    hourly = await _get_hourly_forecast(lat_r, lng_r, forecast_days)

    times = hourly.get("time", [])
    cloud_covers = hourly.get("cloud_cover", [])
    temps = hourly.get("temperature_2m", [])
    winds = hourly.get("wind_speed_10m", [])

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
