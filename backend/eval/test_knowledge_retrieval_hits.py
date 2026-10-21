"""
Step 5b — deterministic retrieval-hit tests (no LLM judge).

Mirrors knowledge_node's real retrieval path (sub-queries -> search ->
dedupe -> guardrail -> top 5) and checks that the expected chunk comes
back, ranked above its look-alike. Run once per mode and compare:

  RAG_SEARCH_MODE=vector pytest eval/test_knowledge_retrieval_hits.py -v -s
  RAG_SEARCH_MODE=hybrid pytest eval/test_knowledge_retrieval_hits.py -v -s

Requires SUPABASE_URL/SUPABASE_SERVICE_KEY and VOYAGE_API_KEY.
"""

import os

import pytest

from agents.graph.knowledge_node import _build_sub_quires
from agents.knowledge import search_knowledge_base
from app_guardrails.knowledge_guardrails import screen_knowledge_chunks
from eval.datasets.retrieval_hit_cases import RETRIEVAL_HIT_CASES, RetrievalHitCase


async def _final_chunks(case: RetrievalHitCase) -> list[dict]:
    """Same steps as knowledge_node — what report_writer actually receives."""
    sub_queries = _build_sub_quires(case.question, case.norad_id)
    all_chunks: list[dict] = []
    seen: set[str] = set()
    for q in sub_queries:
        for c in await search_knowledge_base(query=q, limit=3, norad_id=case.norad_id):
            content = c.get("content", "")
            if content not in seen:
                seen.add(content)
                all_chunks.append(c)
    return screen_knowledge_chunks(all_chunks).safe_chunks[:5]


def _titles(chunks: list[dict]) -> list[str]:
    return [c.get("metadata", {}).get("title", "") for c in chunks]


@pytest.mark.parametrize("case", RETRIEVAL_HIT_CASES, ids=lambda c: c.id)
@pytest.mark.asyncio
async def test_expected_chunk_retrieved(case: RetrievalHitCase):
    mode = os.getenv("RAG_SEARCH_MODE", "vector")
    titles = _titles(await _final_chunks(case))
    print(f"\n[{mode}] {case.id}: {titles}")

    assert (
        case.expected_title in titles
    ), f"[{mode}] expected {case.expected_title!r}, got {titles}"

    if case.confusable_title and case.confusable_title in titles:
        assert titles.index(case.expected_title) < titles.index(
            case.confusable_title
        ), f"[{mode}] {case.confusable_title!r} outranked {case.expected_title!r}: {titles}"
