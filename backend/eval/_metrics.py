"""
Deterministic DeepEval metric — exact-match, no LLM judge involved.

Used for the trajectory layers (orchestrator routing, calendar action
classification) where "correct" is a plain equality check against a
dataset-pinned expectation, not a quality judgment an LLM needs to grade.
Keeping these on DeepEval's own BaseMetric/assert_test machinery (rather
than bare pytest asserts) means every layer in eval/ reports through the
same `deepeval test run` output and pass/fail semantics.

Callers do the actual comparison themselves (set equality, Pydantic
field subsets, whatever the case calls for) and hand this metric a pair
of canonical strings that are equal iff the comparison passed — see
test_orchestrator_routing.py / test_calendar_action_classify.py for the
pattern.
"""

from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase


class DeterministicMatchMetric(BaseMetric):
    threshold: float = 1.0

    def __init__(self, threshold: float = 1.0):
        self.threshold = threshold
        self.score = None
        self.success = None
        self.reason = None

    def measure(self, test_case: LLMTestCase) -> float:
        self.score = 1.0 if test_case.actual_output == test_case.expected_output else 0.0
        self.reason = (
            "exact match"
            if self.score == 1.0
            else f"expected {test_case.expected_output!r}, got {test_case.actual_output!r}"
        )
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return bool(self.success)

    @property
    def __name__(self) -> str:
        return "Deterministic Match"
