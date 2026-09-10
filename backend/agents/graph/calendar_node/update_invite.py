from agents.graph.calendar_node.handle_tool_error import handle_tool_error
from agents.graph.state import CalendarData


async def update_invite(
    session,
    access_token: str,
    writable: list[dict],
    dedupe_key: str,
    reminder_minutes: int,
    clerk_user_id: str,
    satname: str,
    start_utc: int,
) -> dict:
    for cal in writable:
        result = await session.call_tool(
            "update_event",
            {
                "access_token": access_token,
                "calendar_id": cal["id"],
                "dedupe_key": dedupe_key,
                "reminder_minutes": reminder_minutes,
                "satname": satname,
                "start_utc": start_utc,
            },
        )
        error = await handle_tool_error(result, clerk_user_id, "update_event")
        if error:
            return error
        data = result.structuredContent or {}
        if data.get("updated"):
            return {
                "calendar_data": CalendarData(
                    action="updated",
                    event_link=data.get("htmlLink"),
                    summary=f"Updated the reminder to {reminder_minutes} "
                    "minutes before the pass.",
                ),
                "tools_used": ["google_calendar"],
            }

    return {
        "calendar_data": CalendarData(
            action="not_found",
            summary="I couldn't find an AstroWatch invite for that pass "
            "on your calendar.",
        )
    }
