"""
RAG dataset for knowledge_node (agents/graph/knowledge_node.py).

Each case is a natural-language question a user might ask AstroWatch AI
about a satellite/mission, plus a human-written reference_answer the
retrieved chunks should support. Used by test_knowledge_rag.py to score
retrieval quality (ContextualPrecision/Recall) and groundedness
(Faithfulness) of the knowledge base's actual content — these hit the
real pgvector store (SUPABASE_URL/SUPABASE_SERVICE_KEY, VOYAGE_API_KEY),
so results depend on what's actually been ingested (see rag/ingest.py).
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class KnowledgeCase:
    id: str
    question: str
    norad_id: Optional[int]
    reference_answer: str


KNOWLEDGE_RAG_CASES: list[KnowledgeCase] = [
    KnowledgeCase(
        id="iss_mission_overview",
        question="What is the International Space Station's mission?",
        norad_id=25544,
        reference_answer=(
            "The International Space Station (ISS) is a habitable space "
            "station in low Earth orbit used as a microgravity research "
            "laboratory, where crews from multiple space agencies conduct "
            "science experiments and technology demonstrations."
        ),
    ),
    KnowledgeCase(
        id="iss_recent_news",
        question="What's the latest news about the ISS?",
        norad_id=25544,
        reference_answer=(
            "Recent spaceflight news about the ISS covers crew rotations, "
            "resupply missions, and ongoing scientific experiments aboard "
            "the station."
        ),
    ),
    KnowledgeCase(
        id="hubble_facts",
        question="Tell me about the Hubble Space Telescope.",
        norad_id=20580,
        reference_answer=(
            "The Hubble Space Telescope is a large space-based observatory "
            "launched in 1990 that has captured deep-space imagery and made "
            "major contributions to astronomy, including measurements of "
            "the universe's expansion rate."
        ),
    ),
    KnowledgeCase(
        id="tiangong_facts",
        question="What is the Tiangong space station?",
        norad_id=48274,
        reference_answer=(
            "Tiangong is China's modular space station in low Earth orbit, "
            "crewed by Chinese astronauts (taikonauts) conducting science "
            "and technology experiments."
        ),
    ),
    KnowledgeCase(
        id="general_astronomy_no_satellite",
        question="What is the Astronomy Picture of the Day about lately?",
        norad_id=None,
        reference_answer=(
            "NASA's Astronomy Picture of the Day (APOD) features a "
            "different image or photograph of our universe each day, along "
            "with a brief explanation written by a professional astronomer."
        ),
    ),
]
