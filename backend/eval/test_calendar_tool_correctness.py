"""
Step 5 — calendar_node's create/delete/update_invite tool-correctness
tests, against a mocked MCP session (no real Google Calendar API calls).

Each function under test drives an MCP `session.call_tool(...)` sequence
directly (agents/graph/calendar_node/{create,delete,update}_invite.py);
FakeMCPSession records every call as a DeepEval ToolCall so
ToolCorrectnessMetric can grade both whether the right tool(s) were
called (deterministic name/order match) and — via `available_tools` — an
LLM-judged read on whether that was an appropriate tool choice given the
user's message. That LLM-judge component is why this sits in the
pre-release tier alongside RAG and end-to-end, not the per-push tier.

Requires ANTHROPIC_API_KEY (DeepEval judge) plus SUPABASE_URL/
SUPABASE_SERVICE_KEY to import calendar_node's own module tree (several
modules build a Supabase client at import time — see
rag/database.py:get_supabase, used by handle_tool_error.py and
get_valid_access_token.py). No live Supabase calls are made here: the one
code path that would make one (handle_tool_error's 401 branch) has its
module-level client monkeypatched out.
"""

from unittest.mock import MagicMock, patch

import pytest
from deepeval import assert_test
from deepeval.metrics import ToolCorrectnessMetric
from deepeval.test_case import LLMTestCase, ToolCall

from agents.graph.calendar_node.create_invite import create_invite
from agents.graph.calendar_node.delete_invite import delete_across_calendars
from agents.graph.calendar_node.update_invite import update_invite
from agents.models import SatellitePass
from eval._judge_model import get_judge_model

# The full universe of tools calendar_server.py's MCP server exposes —
# passed as ToolCorrectnessMetric's `available_tools` so it can also judge
# tool *selection*, not just whether the expected tool fired.
_AVAILABLE_TOOLS = [
    ToolCall(name="list_calendars"),
    ToolCall(name="create_event"),
    ToolCall(name="delete_event"),
    ToolCall(name="update_event"),
]

_SELECTED_PASS = SatellitePass(
    satid=25544,
    satname="ISS",
    startAz=45.0,
    startAzCompass="NE",
    startEl=10.0,
    startUTC=2_000_000_000,
    maxAz=180.0,
    maxEl=60.0,
    maxUTC=2_000_000_300,
    endAz=270.0,
    endUTC=2_000_000_600,
    mag=-1.5,
    duration=300,
)
_DEDUPE_KEY = "aw_testkey0000000000000000000000"


class FakeToolResult:
    def __init__(self, structuredContent=None, isError=False, content=None):
        self.structuredContent = structuredContent
        self.isError = isError
        self.content = content or []


class FakeMCPSession:
    """Records every call_tool invocation as a DeepEval ToolCall and
    returns a scripted response, keyed by tool name — a script with more
    than one entry per name is consumed in order (for loop-over-calendars
    functions that call the same tool once per calendar)."""

    def __init__(self, responses: dict[str, list[FakeToolResult]]):
        self._responses = {name: list(results) for name, results in responses.items()}
        self.calls: list[ToolCall] = []

    async def call_tool(self, name: str, args: dict):
        self.calls.append(ToolCall(name=name, input_parameters=dict(args)))
        queue = self._responses[name]
        return queue.pop(0) if len(queue) > 1 else queue[0]


def _text_content(text: str):
    from mcp.types import TextContent

    return TextContent(type="text", text=text)


def _assert_tool_trajectory(user_input: str, tools_called: list[ToolCall], expected: list[ToolCall]):
    test_case = LLMTestCase(
        input=user_input,
        actual_output="n/a",  # ToolCorrectnessMetric doesn't grade this field
        tools_called=tools_called,
        expected_tools=expected,
    )
    metric = ToolCorrectnessMetric(
        threshold=0.7,
        model=get_judge_model(),
        available_tools=_AVAILABLE_TOOLS,
    )
    assert_test(test_case, [metric])


# ── create_invite ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_invite_single_calendar_success():
    session = FakeMCPSession(
        {
            "create_event": [
                FakeToolResult(
                    structuredContent={
                        "htmlLink": "https://calendar.google.com/event?eid=abc",
                        "already_existed": False,
                    }
                )
            ]
        }
    )
    writable = [{"id": "primary", "summary": "Personal", "accessRole": "owner"}]

    result = await create_invite(
        session, "add this pass please", writable, _SELECTED_PASS,
        _DEDUPE_KEY, "access-token", "user-1",
    )

    assert result["calendar_data"].action == "created"
    assert result["calendar_data"].event_link == "https://calendar.google.com/event?eid=abc"
    _assert_tool_trajectory(
        "add this pass please",
        session.calls,
        [ToolCall(name="create_event")],
    )


@pytest.mark.asyncio
async def test_create_invite_multiple_calendars_needs_confirmation():
    session = FakeMCPSession({"create_event": [FakeToolResult(structuredContent={})]})
    writable = [
        {"id": "primary", "summary": "Personal", "accessRole": "owner"},
        {"id": "work-cal", "summary": "Work", "accessRole": "owner"},
    ]

    result = await create_invite(
        session, "add this pass", writable, _SELECTED_PASS,
        _DEDUPE_KEY, "access-token", "user-1",
    )

    assert result["calendar_data"].action == "needs_confirmation"
    assert result["calendar_data"].confirmation_kind == "create"
    # Ambiguous — nothing should have been written yet.
    _assert_tool_trajectory("add this pass", session.calls, [])


@pytest.mark.asyncio
async def test_create_invite_multiple_calendars_matched_by_name():
    session = FakeMCPSession(
        {
            "create_event": [
                FakeToolResult(structuredContent={"htmlLink": "https://x", "already_existed": False})
            ]
        }
    )
    writable = [
        {"id": "primary", "summary": "Personal", "accessRole": "owner"},
        {"id": "work-cal", "summary": "Work", "accessRole": "owner"},
    ]

    result = await create_invite(
        session, "add this to my Work calendar", writable, _SELECTED_PASS,
        _DEDUPE_KEY, "access-token", "user-1",
    )

    assert result["calendar_data"].action == "created"
    assert session.calls[0].input_parameters["calendar_id"] == "work-cal"
    _assert_tool_trajectory(
        "add this to my Work calendar",
        session.calls,
        [ToolCall(name="create_event")],
    )


# ── delete_across_calendars ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_invite_found_on_first_calendar():
    session = FakeMCPSession({"delete_event": [FakeToolResult(structuredContent={"deleted": True})]})
    writable = [{"id": "primary", "summary": "Personal"}]

    result = await delete_across_calendars(
        session, "access-token", writable, _DEDUPE_KEY, "user-1", "ISS", 2_000_000_000
    )

    assert result["calendar_data"].action == "deleted"
    _assert_tool_trajectory(
        "delete this pass",
        session.calls,
        [ToolCall(name="delete_event")],
    )


@pytest.mark.asyncio
async def test_delete_invite_not_found_across_all_calendars():
    session = FakeMCPSession(
        {"delete_event": [FakeToolResult(structuredContent={"deleted": False})] * 2}
    )
    writable = [
        {"id": "primary", "summary": "Personal"},
        {"id": "work-cal", "summary": "Work"},
    ]

    result = await delete_across_calendars(
        session, "access-token", writable, _DEDUPE_KEY, "user-1", "ISS", 2_000_000_000
    )

    assert result["calendar_data"].action == "not_found"
    assert len(session.calls) == 2
    _assert_tool_trajectory(
        "delete this pass",
        session.calls,
        [ToolCall(name="delete_event"), ToolCall(name="delete_event")],
    )


# ── update_invite ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_invite_found_and_updated():
    session = FakeMCPSession(
        {
            "update_event": [
                FakeToolResult(structuredContent={"updated": True, "htmlLink": "https://x"})
            ]
        }
    )
    writable = [{"id": "primary", "summary": "Personal"}]

    result = await update_invite(
        session, "access-token", writable, _DEDUPE_KEY, 15, "user-1", "ISS", 2_000_000_000
    )

    assert result["calendar_data"].action == "updated"
    _assert_tool_trajectory(
        "remind me 15 minutes before",
        session.calls,
        [ToolCall(name="update_event")],
    )


@pytest.mark.asyncio
async def test_update_invite_not_found_across_all_calendars():
    session = FakeMCPSession(
        {"update_event": [FakeToolResult(structuredContent={"updated": False})] * 2}
    )
    writable = [
        {"id": "primary", "summary": "Personal"},
        {"id": "work-cal", "summary": "Work"},
    ]

    result = await update_invite(
        session, "access-token", writable, _DEDUPE_KEY, 15, "user-1", "ISS", 2_000_000_000
    )

    assert result["calendar_data"].action == "not_found"
    _assert_tool_trajectory(
        "remind me 15 minutes before",
        session.calls,
        [ToolCall(name="update_event"), ToolCall(name="update_event")],
    )


# ── handle_tool_error's auth-revoked branch ──────────────────────────


@pytest.mark.asyncio
async def test_create_invite_revoked_token_short_circuits():
    session = FakeMCPSession(
        {
            "create_event": [
                FakeToolResult(
                    isError=True,
                    content=[_text_content("401 invalid_token: token expired")],
                )
            ]
        }
    )
    writable = [{"id": "primary", "summary": "Personal", "accessRole": "owner"}]

    fake_supabase = MagicMock()
    with patch(
        "agents.graph.calendar_node.handle_tool_error._supabase", fake_supabase
    ):
        result = await create_invite(
            session, "add this pass", writable, _SELECTED_PASS,
            _DEDUPE_KEY, "access-token", "user-1",
        )

    assert result["calendar_data"].action == "not_connected"
    fake_supabase.table.assert_called_with("google_oauth_tokens")
    _assert_tool_trajectory(
        "add this pass",
        session.calls,
        [ToolCall(name="create_event")],
    )
