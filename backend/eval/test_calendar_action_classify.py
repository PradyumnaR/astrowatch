"""
Step 3 — calendar_node.classify_action trajectory tests.

classify_action is real Anthropic tool-calling (bind_tools) over a cheap
model — like orchestrator routing, this is a deterministic correctness
check on a genuine LLM call, not an LLM-judged quality score:
DeterministicMatchMetric checks the returned Pydantic class (+ pinned
fields) against calendar_action_cases.py by plain equality.

Requires ANTHROPIC_API_KEY (real classifier calls) but no DeepEval judge.
"""

import pytest
from deepeval import assert_test
from deepeval.test_case import LLMTestCase

from agents.graph.calendar_node.classify_action import classify_action
from agents.graph.state import AgentState
from agents.models import SatellitePass
from eval._metrics import DeterministicMatchMetric
from eval.datasets.calendar_action_cases import (
    CALENDAR_ACTION_CASES,
    CalendarActionCase,
)

_SELECTED_PASS = SatellitePass(
    satid=25544,
    satname="ISS",
    startAz=45.0,
    startAzCompass="NE",
    startEl=10.0,
    startUTC=2_000_000_000,
    maxAz=180.0,
    maxEl=60.0,
    maxUTC=2_000_000_100,
    endAz=270.0,
    endUTC=2_000_000_300,
    mag=-1.5,
    duration=300,
)


def _describe(cls, fields: dict) -> str:
    name = cls.__name__ if cls is not None else "None"
    return f"{name}({fields})"


def _matches(action, expected_class, expected_fields: dict) -> bool:
    if expected_class is None:
        return action is None
    if action is None or type(action) is not expected_class:
        return False
    dumped = action.model_dump()
    return all(dumped.get(key) == value for key, value in expected_fields.items())


@pytest.mark.parametrize("case", CALENDAR_ACTION_CASES, ids=lambda c: c.id)
@pytest.mark.asyncio
async def test_calendar_action_classify(case: CalendarActionCase):
    state: AgentState = {
        "messages": case.messages,
        "location": None,
        "selected_pass": _SELECTED_PASS,
        "clerk_user_id": "eval-test-user",
        "routing": None,
        "passes_data": None,
        "weather_data": None,
        "knowledge_data": None,
        "calendar_data": None,
        "tools_used": [],
        "sources": [],
        "errors": [],
        "guardrail_events": [],
        "final_response": None,
    }

    action = await classify_action(state)

    matched = _matches(action, case.expected_class, case.expected_fields)
    actual_description = (
        "None" if action is None else _describe(type(action), action.model_dump())
    )
    actual = (
        "match"
        if matched
        else f"mismatch: got {actual_description}, expected "
        f"{_describe(case.expected_class, case.expected_fields)}"
    )
    expected = "match"

    test_case = LLMTestCase(
        input=case.messages[-1].content,
        actual_output=actual,
        expected_output=expected,
    )
    assert_test(test_case, [DeterministicMatchMetric()])
