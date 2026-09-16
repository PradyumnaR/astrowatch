"""
Step 2 — orchestrator_node trajectory tests.

orchestrator_node calls a real (cheap, Haiku) router model, so this is a
correctness check on a genuine LLM call, not an LLM-*judged* quality
score: DeterministicMatchMetric just checks the resulting RoutingDecision
against orchestrator_cases.py by plain equality (agents_to_call as a set,
plus norad_id). That's what keeps this test cheap and deterministic
enough to run on every push, per the eval pipeline's execution tiers.

The confirmation-reply cases additionally assert the router LLM was
never invoked at all, exercising is_calendar_confirmation_reply's
deterministic shortcut in orchestrator_node.py directly.

Requires ANTHROPIC_API_KEY (real router calls) but no DeepEval judge —
safe to run on every push.
"""

from unittest.mock import MagicMock, patch

import pytest
from deepeval import assert_test
from deepeval.test_case import LLMTestCase

from agents.graph.orchestrator_node import orchestrator_node
from agents.graph.state import AgentState
from agents.models import Location, SatellitePass
from eval._metrics import DeterministicMatchMetric
from eval.datasets.orchestrator_cases import ORCHESTRATOR_CASES, OrchestratorCase


def _selected_pass(norad_id: int | None) -> SatellitePass | None:
    if norad_id is None:
        return None
    return SatellitePass(
        satid=norad_id,
        satname="Test Satellite",
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


def _build_state(case: OrchestratorCase) -> AgentState:
    return {
        "messages": case.messages,
        "location": Location(lat=34.18, lng=-118.31, name="Burbank, CA"),
        "selected_pass": _selected_pass(case.selected_pass_norad_id),
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


@pytest.mark.parametrize("case", ORCHESTRATOR_CASES, ids=lambda c: c.id)
def test_orchestrator_routing(case: OrchestratorCase):
    state = _build_state(case)

    if case.expect_zero_llm_calls:
        # _router_model is a LangChain RunnableSequence (Pydantic-based) —
        # its `invoke` is a class method, not a mutable instance attribute,
        # so patch.object(..., "invoke") can't set/restore it. Swapping the
        # whole module-level binding for a MagicMock sidesteps that.
        mock_model = MagicMock()
        with patch("agents.graph.orchestrator_node._router_model", new=mock_model):
            result = orchestrator_node(state)
            mock_model.invoke.assert_not_called()
    else:
        result = orchestrator_node(state)

    routing = result["routing"]
    matched = (
        set(routing.agents_to_call) == set(case.expected_agents)
        and routing.norad_id == case.expected_norad_id
    )
    actual = (
        "match"
        if matched
        else f"mismatch: agents_to_call={routing.agents_to_call} norad_id={routing.norad_id}"
    )
    expected = "match"

    test_case = LLMTestCase(
        input=case.messages[-1].content,
        actual_output=actual,
        expected_output=expected,
    )
    assert_test(test_case, [DeterministicMatchMetric()])
