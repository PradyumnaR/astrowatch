"""
Prints what the knowledge base actually returns for each question in
eval/datasets/knowledge_rag_cases.py — no grading, no LLM judge, just the
raw retrieval so reference_answer can be rewritten from real content
instead of guessed. Run from backend/ with your real .env in place:

    python scripts/dump_knowledge_rag_chunks.py

Needs SUPABASE_URL / SUPABASE_SERVICE_KEY / VOYAGE_API_KEY.
"""

from dotenv import load_dotenv

load_dotenv()  # must run before importing anything that builds a Supabase/Voyage client

import asyncio
import os
import sys

# `python scripts/dump_knowledge_rag_chunks.py` only puts this file's own
# directory (backend/scripts/) on sys.path, not backend/ itself — so the
# `agents`/`eval` packages below wouldn't otherwise be importable. Adding
# backend/ explicitly makes this work regardless of invocation style
# (plain script, `python -m scripts.dump_knowledge_rag_chunks`, etc.).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.knowledge import search_knowledge_base
from agents.graph.knowledge_node import _build_sub_quires
from eval.datasets.knowledge_rag_cases import KNOWLEDGE_RAG_CASES


async def dump_case(case) -> None:
    print("=" * 100)
    print(f"case: {case.id}")
    print(f"question: {case.question}")
    print(f"norad_id: {case.norad_id}")
    print(f"current (guessed) reference_answer: {case.reference_answer!r}")
    print("-" * 100)

    sub_queries = _build_sub_quires(case.question, case.norad_id)
    print(f"sub-queries searched: {sub_queries}")

    seen_content: set[str] = set()
    chunk_count = 0
    for q in sub_queries:
        chunks = await search_knowledge_base(query=q, limit=3, norad_id=case.norad_id)
        for c in chunks:
            content = c.get("content", "")
            if content in seen_content:
                continue
            seen_content.add(content)
            chunk_count += 1
            source = c.get("source", "unknown")
            similarity = c.get("similarity")
            metadata = c.get("metadata", {})
            print(f"\n[{chunk_count}] source={source} similarity={similarity}")
            if metadata.get("title"):
                print(f"    title: {metadata['title']}")
            if metadata.get("url"):
                print(f"    url: {metadata['url']}")
            print(f"    content: {content}")

    if chunk_count == 0:
        print("\n  >>> NO CHUNKS RETURNED — this topic may not be ingested at all.")
    print()


async def main() -> None:
    for case in KNOWLEDGE_RAG_CASES:
        await dump_case(case)


if __name__ == "__main__":
    asyncio.run(main())
