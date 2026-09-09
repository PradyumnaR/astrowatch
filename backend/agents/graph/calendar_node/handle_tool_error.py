from rag.database import get_supabase
from agents.graph.state import CalendarData
from mcp.types import TextContent

_supabase = get_supabase()


async def handle_tool_error(
    result, clerk_user_id: str, action_label: str
) -> dict | None:
    """
    Checks an MCP CallToolResult for an error. Returns a dict to
    return-early with if something went wrong, or None if the call
    succeeded and calendar_node should keep going.

    Centralizes the auth-revoked detection so it only needs to be
    correct in one place — every tool call this file makes shares this
    same failure shape (a dead access_token) and gets the same handling
    for free.
    """
    if not result.isError:
        return None

    error_text = "".join(c.text for c in result.content if isinstance(c, TextContent))

    if "401" in error_text or "invalid_token" in error_text.lower():
        _supabase.table("google_oauth_tokens").delete().eq(
            "clerk_user_id", clerk_user_id
        ).execute()
        return {
            "calendar_data": CalendarData(
                action="not_connected",
                summary="Google Calendar access was revoked. Please reconnect.",
            )
        }

    return {
        "calendar_data": CalendarData(
            action="error",
            summary=f"Calendar error during {action_label}: {error_text}",
        ),
        "errors": [f"calendar_node_error: {error_text}"],
    }
