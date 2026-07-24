"""Satellite Agent node — wraps existing N2YO pass-fetching logic."""

from utils.format_to_client_time import format_to_client_time
from tools.passes import get_satellite_passes
from agents.graph.state import AgentState, PassesData

# Fallback when no satellite is currently selected in the frontend
DEFAULT_NORAD_ID = 25544  # ISS


def _build_viewing_tips(best_pass: dict | None, tz_name: str) -> str:
    if not best_pass:
        return "No upcoming passes found in the requested window"
    el = best_pass.get("maxEl", "unknown")
    direction = best_pass.get("startAzCompass", "the horizon")
    start_utc = best_pass.get("startUTC")
    time_str = (
        format_to_client_time(start_utc, tz_name) if start_utc else "an unknown time"
    )

    return f"Best passes at {time_str} reaches {el}° elevation. Look forward {direction} as it raises"


async def satellite_node(state: AgentState) -> dict:
    location = state.get("location")
    selected_pass = state.get("selected_pass")
    routing = state.get("routing")

    norad_id = (
        (routing.norad_id if routing else None)
        or (selected_pass.satid if selected_pass else None)
        or DEFAULT_NORAD_ID
    )

    if location is None:
        state["errors"] = ["satellite_node_error: no location provided"]
        state["passes_data"] = None
        return {
            "errors": ["satellite_node_error: no location provided"],
            "passes_data": None,
        }
    tz_name = location.timezone or "UTC"

    try:
        raw = await get_satellite_passes(
            norad_id=norad_id,
            lat=location.lat,
            lng=location.lng,
        )

        passes = raw.get("passes", [])
        best_pass = max(passes, key=lambda p: p.get("maxEl", 0)) if passes else None
        return {
            "passes_data": PassesData(
                passes=passes,
                best_pass=best_pass,
                viewing_tips=_build_viewing_tips(best_pass, tz_name),
            ),
            "tools_used": ["get_satellite_passes"],
        }
    except Exception as e:
        return {"errors": [f"satellite_node_error: {e}"], "passes_data": None}
