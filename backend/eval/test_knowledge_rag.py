"""
Step 4 — knowledge_node RAG quality tests.

Runs the real retrieval path (agents.knowledge.search_knowledge_base,
the same multi-query expansion knowledge_node itself uses via
_build_sub_quires) against the live pgvector knowledge base, then grades
it two ways:

- ContextualPrecision / ContextualRecall, computed once on the raw
  retrieved chunks ("all_chunks") and once on the guardrail-screened
  subset ("safe_chunks", via app_guardrails.knowledge_guardrails) — the
  gap between the two is the guardrail's cost in retrieval quality.
- Faithfulness, computed only against safe_chunks (what report_writer_node
  actually gets to work with), on a real synthesized response — report_
  writer_node run with only knowledge_data populated, so the
  actual_output under test is genuinely grounded (or not) in exactly
  what knowledge_node would have passed downstream.

Requires ANTHROPIC_API_KEY, SUPABASE_URL/SUPABASE_SERVICE_KEY, and
VOYAGE_API_KEY (real embeddings + pgvector search) plus a DeepEval judge
— this is the pre-release / LLM-judge tier, not a per-push check.
"""

import pytest
from deepeval import assert_test
from deepeval.metrics import ContextualPrecisionMetric, ContextualRecallMetric, FaithfulnessMetric
from deepeval.test_case import LLMTestCase

from agents.knowledge import search_knowledge_base
from agents.graph.knowledge_node import _build_sub_quires
from agents.graph.report_writer_node import report_writer_node
from agents.graph.state import AgentState, KnowledgeData, RoutingDecision
from app_guardrails.knowledge_guardrails import screen_knowledge_chunks
from eval._judge_model import get_judge_model
from eval.datasets.knowledge_rag_cases import KNOWLEDGE_RAG_CASES, KnowledgeCase


async def _retrieve_all_chunks(question: str, norad_id: int | None) -> list[dict]:
    """Mirrors knowledge_node's own retrieval loop exactly, but returns
    every chunk found — pre-guardrail — so tests can compare against the
    post-guardrail set."""
    sub_queries = _build_sub_quires(question, norad_id)
    all_chunks: list[dict] = []
    seen_content: set[str] = set()
    for q in sub_queries:
        chunks = await search_knowledge_base(query=q, limit=3, norad_id=norad_id)
        for c in chunks:
            content = c.get("content", "")
            if content not in seen_content:
                seen_content.add(content)
                all_chunks.append(c)
    return all_chunks


def _contents(chunks: list[dict]) -> list[str]:
    return [c.get("content", "") for c in chunks if c.get("content")]


async def _case_chunks(case: KnowledgeCase) -> tuple[list[dict], list[dict]]:
    all_chunks = await _retrieve_all_chunks(case.question, case.norad_id)
    if not all_chunks:
        pytest.skip(f"no chunks retrieved for {case.id!r} — knowledge base may be empty")
    safe_chunks = screen_knowledge_chunks(all_chunks).safe_chunks[:5]
    return all_chunks, safe_chunks


@pytest.mark.parametrize("case", KNOWLEDGE_RAG_CASES, ids=lambda c: c.id)
@pytest.mark.asyncio
async def test_contextual_precision_raw_vs_safe(case: KnowledgeCase):
    all_chunks, safe_chunks = await _case_chunks(case)
    judge = get_judge_model()

    raw_case = LLMTestCase(
        input=case.question,
        expected_output=case.reference_answer,
        retrieval_context=_contents(all_chunks),
    )
    assert_test(raw_case, [ContextualPrecisionMetric(threshold=0.5, model=judge)])

    safe_case = LLMTestCase(
        input=case.question,
        expected_output=case.reference_answer,
        retrieval_context=_contents(safe_chunks) or _contents(all_chunks),
    )
    assert_test(safe_case, [ContextualPrecisionMetric(threshold=0.5, model=judge)])


@pytest.mark.parametrize("case", KNOWLEDGE_RAG_CASES, ids=lambda c: c.id)
@pytest.mark.asyncio
async def test_contextual_recall_raw_vs_safe(case: KnowledgeCase):
    all_chunks, safe_chunks = await _case_chunks(case)
    judge = get_judge_model()

    raw_case = LLMTestCase(
        input=case.question,
        expected_output=case.reference_answer,
        retrieval_context=_contents(all_chunks),
    )
    assert_test(raw_case, [ContextualRecallMetric(threshold=0.5, model=judge)])

    safe_case = LLMTestCase(
        input=case.question,
        expected_output=case.reference_answer,
        retrieval_context=_contents(safe_chunks) or _contents(all_chunks),
    )
    assert_test(safe_case, [ContextualRecallMetric(threshold=0.5, model=judge)])


@pytest.mark.parametrize("case", KNOWLEDGE_RAG_CASES, ids=lambda c: c.id)
@pytest.mark.asyncio
async def test_faithfulness_on_safe_chunks(case: KnowledgeCase):
    _all_chunks, safe_chunks = await _case_chunks(case)

    state: AgentState = {
        "messages": [],
        "location": None,
        "selected_pass": None,
        "clerk_user_id": "eval-test-user",
        "routing": RoutingDecision(
            intent="knowledge",
            agents_to_call=["knowledge"],
            reasoning="eval fixture",
            resolved_query=case.question,
            norad_id=case.norad_id,
        ),
        "passes_data": None,
        "weather_data": None,
        "knowledge_data": KnowledgeData(chunks=safe_chunks, summary="", citations=[]),
        "calendar_data": None,
        "tools_used": [],
        "sources": [],
        "errors": [],
        "guardrail_events": [],
        "final_response": None,
    }

    result = await report_writer_node(state)
    actual_output = result["final_response"]

    test_case = LLMTestCase(
        input=case.question,
        actual_output=actual_output,
        retrieval_context=_contents(safe_chunks),
    )
    assert_test(test_case, [FaithfulnessMetric(threshold=0.7, model=get_judge_model())])
