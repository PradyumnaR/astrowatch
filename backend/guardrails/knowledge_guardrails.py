"""
RAG content guardrails — OWASP ASI06 (Memory & Context Poisoning)
mitigation.

knowledge_node retrieves chunks from the pgvector knowledge base and
report_writer_node folds their raw text straight into the prompt it
sends to the LLM (see report_writer_node._format_context). That's fine
as long as everything in the knowledge base is genuine reference
material — but nothing today verifies that. A single poisoned document
(a bad scrape, a compromised ingestion source, a submission that later
got embedded) sitting in the vector store would get retrieved like any
other chunk, and its content would land directly in report_writer's
context, indistinguishable from real instructions to the model. This is
the RAG version of the same problem calendar_guardrails/injection_guard
defend against at the input boundary — except here the "input" is data
from our own database, not the user's message.

Reuses injection_guard.classify_injection rather than a separate
classifier — same detection logic (Prompt Guard 2 when enabled, regex
fallback otherwise), just applied to a different surface.
"""

from dataclasses import dataclass, field

from guardrails.injection_guard import classify_injection

# Real reference chunks are prose/facts. Anything wildly longer than
# what knowledge_node ever asks for (limit=3 per sub-query, and the
# vector store's own chunking is bounded) is itself a signal something
# is off — cheap to check even though length alone won't catch most
# poisoning attempts.
MAX_CHUNK_LENGTH = 4000


@dataclass
class KnowledgeScreenResult:
    safe_chunks: list[dict]
    dropped_count: int = 0
    reasons: list[str] = field(default_factory=list)


def screen_knowledge_chunks(chunks: list[dict]) -> KnowledgeScreenResult:
    """
    Filters retrieved RAG chunks before they're allowed into
    KnowledgeData / report_writer's context. Fails closed per-chunk: a
    chunk that looks like it's trying to inject instructions is dropped
    entirely rather than passed through with a warning — a missing fact
    just means a slightly less complete answer; a poisoned instruction
    reaching the writer model is the failure mode actually worth
    avoiding.
    """
    safe_chunks: list[dict] = []
    reasons: list[str] = []

    for chunk in chunks:
        content = chunk.get("content", "") or ""

        if len(content) > MAX_CHUNK_LENGTH:
            reasons.append("chunk_dropped_oversized")
            continue

        verdict = classify_injection(content)
        if verdict.is_injection:
            reasons.append(f"chunk_dropped_suspected_injection:{verdict.method}")
            continue

        safe_chunks.append(chunk)

    return KnowledgeScreenResult(
        safe_chunks=safe_chunks,
        dropped_count=len(chunks) - len(safe_chunks),
        reasons=reasons,
    )
