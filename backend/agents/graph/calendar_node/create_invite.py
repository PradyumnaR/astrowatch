from app_guardrails.calendar_guardrails import detect_prompt_injection
from agents.graph.state import CalendarData
from datetime import datetime, timezone

from agents.models import SatellitePass
from agents.graph.calendar_node.handle_tool_error import handle_tool_error


async def create_invite(
    session,
    calendar_id: str,
    selected_pass: SatellitePass,
    dedupe_key: str,
    access_token: str,
    clerk_user_id: str,
) -> dict:
    # Create the event. Which calendar was decided before this was called:
    # automatically when there's one writable calendar, otherwise by the
    # user's click (validated against the offered options in calendar_confirm).
    start_iso = datetime.fromtimestamp(
        selected_pass.startUTC, tz=timezone.utc
    ).isoformat()
    end_iso = datetime.fromtimestamp(selected_pass.endUTC, tz=timezone.utc).isoformat()

    event_result = await session.call_tool(
        "create_event",
        {
            "access_token": access_token,
            "calendar_id": calendar_id,
            "summary": f"{selected_pass.satname} pass",
            "description": f"Visible satellite pass — max elevation {selected_pass.maxEl}°",
            "start_time": start_iso,
            "end_time": end_iso,
            "reminder_minutes": 10,
            "dedupe_key": dedupe_key,
        },
    )

    error = await handle_tool_error(event_result, clerk_user_id, "create_event")
    if error:
        return error
    event = event_result.structuredContent or {}
    already_existed = bool(event.get("already_existed"))

    return {
        "calendar_data": CalendarData(
            action="created",
            event_link=event.get("htmlLink"),
            already_existed=already_existed,
            summary=(
                f"{selected_pass.satname} pass was already on the calendar."
                if already_existed
                else f"Added {selected_pass.satname} pass to calendar."
            ),
        ),
        "tools_used": ["google_calendar"],
    }
