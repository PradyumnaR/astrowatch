from agents.graph.calendar_node.handle_tool_error import handle_tool_error
from agents.graph.state import CalendarData


async def delete_across_calendars(
    session,
    access_token: str,
    writable: list[dict],
    dedupe_key: str,
    clerk_user_id: str,
) -> dict:
    for cal in writable:
        result = await session.call_tool(
            "delete_event",
            {
                "access_token": access_token,
                "calendar_id": cal["id"],
                "dedupe_key": dedupe_key,
            },
        )
        error = await handle_tool_error(result, clerk_user_id, "delete_event")
        if error:
            return error
        if (result.structuredContent or {}).get("deleted"):
            return {
                "calendar_data": CalendarData(
                    action="deleted",
                    summary="Removed the pass from your calendar.",
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
