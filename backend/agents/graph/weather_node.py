"""Weather Agent node — checks conditions AT the pass time, not just right now.

Priority: if a pass time is known (selected_pass.startUTC), forecast for
that specific hour. Otherwise, fall back to current conditions.
"""

from typing import Literal

from utils.format_to_client_time import format_to_client_time
from tools.weather import get_weather, get_weather_at_time
from agents.graph.state import AgentState, WeatherData


def _go_no_go(cloud_cover: float | None) -> Literal["go", "no-go", "marginal"]:
    if cloud_cover is None:
        return "marginal"
    if cloud_cover < 30:
        return "go"
    if cloud_cover < 70:
        return "marginal"
    return "no-go"


async def weather_node(state: AgentState) -> dict:
    location = state.get("location")
    selected_pass = state.get("selected_pass")

    if location is None:
        return {
            "errors": ["weather_node_error: no location provided"],
            "weather_data": None,
        }
    tz_name = location.timezone or "UTC"

    try:
        if selected_pass is not None and selected_pass.startUTC:
            raw = await get_weather_at_time(
                lat=location.lat,
                lng=location.lng,
                target_utc=selected_pass.startUTC,
            )

            time_label = format_to_client_time(selected_pass.startUTC, tz_name)

        else:
            # no specific pass time known — fall back to current conditions
            raw = await get_weather(lat=location.lat, lng=location.lng)
            time_label = "right now"
        cloud_cover: float | None = raw.get("cloud_cover")

        return {
            "weather_data": WeatherData(
                cloud_cover=cloud_cover,
                temperature=raw.get("temperature"),
                wind_speed=raw.get("wind_speed"),
                conditions_summary=f"At {time_label}: {cloud_cover}% cloud cover, {raw.get('temperature')}°F, {raw.get('wind_speed')} mph wind",
                go_no_go=_go_no_go(cloud_cover),
            ),
            "tools_used": ["get_weather"],
        }
    except Exception as e:
        return {"errors": [f"weather_node_error: {e}"], "weather_data": None}
