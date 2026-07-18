import httpx


async def get_weather(lat: float, lng: float, timezone: str = "auto") -> dict:
    """
    Fetch current weather conditions from Open-Meteo.
    Returns cloud cover, temperature, wind speed.
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
