from app_guardrails.calendar_guardrails import detect_prompt_injection
from agents.graph.state import CalendarData
from datetime import datetime, timezone

from agents.models import SatellitePass
from agents.graph.calendar_node.handle_tool_error import handle_tool_error


async def create_invite(
    session,
    latest_message: str,
    writable: list[dict],
    selected_pass: SatellitePass,
    dedupe_key: str,
    access_token: str,
    clerk_user_id: str,
) -> dict:
    matched = (
        None
        if detect_prompt_injection(latest_message)
        else next(
            (c for c in writable if c.get("summary", "") in latest_message),
            None,
        )
    )
    if matched:
        calendar_id = matched["id"]
    elif len(writable) > 1:
        return {
            "calendar_data": CalendarData(
                action="needs_confirmation",
                confirmation_kind="create",
                summary="Multiple calendars found.",
                calendar_options=[
                    {
                        "label": c.get("summary", c.get("id", "Unnamed")),
                        "value": c.get("id"),
                    }
                    for c in writable
                ],
            )
        }
    else:
        calendar_id = writable[0]["id"] if writable else "primary"

    # Step 2 — create the event
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
