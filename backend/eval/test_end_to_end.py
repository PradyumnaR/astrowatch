"""
Step 6 — report_writer_node end-to-end synthesis tests, one case per
CalendarData.action state (see end_to_end_cases.py's docstring for why
"needs_confirmation" isn't one of them).

Builds the AgentState report_writer_node would see at the end of a real
turn and runs the node for real (a genuine claude-sonnet-4-6 call, same
model report_writer_node uses in production), then grades the response:

- Faithfulness against report_writer_node's own _format_context(state)
  output — the exact context it was given — catching hallucinated claims
  (e.g. a fabricated event link, or claiming success on a failed write).
- TaskCompletion against the user's message — did the response actually
  resolve what the user asked, per REPORT_WRITER_SYSTEM_PROMPT's rules
  (plain confirmation, no apologizing for real actions, no silent
  omission of an event link, etc.)?

Requires ANTHROPIC_API_KEY (real report_writer_node calls) plus a
DeepEval judge — pre-release tier, not a per-push check.
"""

import pytest
from deepeval import assert_test
from deepeval.metrics import FaithfulnessMetric, TaskCompletionMetric
from deepeval.test_case import LLMTestCase

from agents.graph.report_writer_node import _format_context, report_writer_node
from agents.graph.state import AgentState, RoutingDecision
from eval._judge_model import get_judge_model
from eval.datasets.end_to_end_cases import END_TO_END_CASES, ISS_PASS, EndToEndCase, make_messages


def _build_state(case: EndToEndCase) -> AgentState:
    return {
        "messages": make_messages(case.user_message),
        "location": None,
        "selected_pass": ISS_PASS,
        "clerk_user_id": "eval-test-user",
        "routing": RoutingDecision(
            intent="calendar",
            agents_to_call=["calendar"],
            reasoning="eval fixture",
            resolved_query=case.user_message,
            norad_id=None,
        ),
        "passes_data": None,
        "weather_data": None,
        "knowledge_data": None,
        "calendar_data": case.calendar_data,
        "tools_used": [],
        "sources": [],
        "errors": [],
        "guardrail_events": [],
        "final_response": None,
    }


@pytest.mark.parametrize("case", END_TO_END_CASES, ids=lambda c: c.id)
@pytest.mark.asyncio
async def test_report_writer_faithfulness(case: EndToEndCase):
    state = _build_state(case)
    context = _format_context(state)

    result = await report_writer_node(state)
    actual_output = result["final_response"]

    test_case = LLMTestCase(
        input=case.user_message,
        actual_output=actual_output,
        retrieval_context=[context],
    )
    assert_test(test_case, [FaithfulnessMetric(threshold=0.7, model=get_judge_model())])


@pytest.mark.parametrize("case", END_TO_END_CASES, ids=lambda c: c.id)
@pytest.mark.asyncio
async def test_report_writer_task_completion(case: EndToEndCase):
    state = _build_state(case)

    result = await report_writer_node(state)
    actual_output = result["final_response"]

    test_case = LLMTestCase(input=case.user_message, actual_output=actual_output)
    assert_test(test_case, [TaskCompletionMetric(threshold=0.6, model=get_judge_model())])
