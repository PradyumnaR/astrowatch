"""
Deterministic retrieval cases for test_knowledge_retrieval_hits.py.

Each case names the one Wikipedia chunk that must come back
(expected_title) and, optionally, a look-alike that must NOT outrank it
(confusable_title). No LLM judge — pass/fail is a title check.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class RetrievalHitCase:
    id: str
    question: str
    norad_id: Optional[int]
    expected_title: str
    confusable_title: Optional[str] = None


RETRIEVAL_HIT_CASES: list[RetrievalHitCase] = [
    # exact identifiers — where hybrid should help
    RetrievalHitCase(
        id="noaa19_with_norad",
        question="Tell me about NOAA-19",
        norad_id=33591,
        expected_title="NOAA-19",
        confusable_title="NOAA-15",
    ),
    RetrievalHitCase(
        id="noaa19_no_norad",
        question="What is NOAA-19?",
        norad_id=None,
        expected_title="NOAA-19",
        confusable_title="NOAA-15",
    ),
    RetrievalHitCase(
        id="noaa15_no_norad",
        question="What is NOAA-15?",
        norad_id=None,
        expected_title="NOAA-15",
        confusable_title="NOAA-19",
    ),
    # paraphrases — no shared keywords; guards against semantic regressions
    RetrievalHitCase(
        id="hubble_paraphrase",
        question="Which telescope orbiting Earth has been operating since 1990?",
        norad_id=None,
        expected_title="Hubble Space Telescope",
    ),
    RetrievalHitCase(
        id="iss_paraphrase",
        question="Where do astronauts from five space agencies live and run microgravity experiments?",
        norad_id=None,
        expected_title="International Space Station",
    ),
    # plain question — should pass in both modes
    RetrievalHitCase(
        id="tiangong_direct",
        question="What is China's space station?",
        norad_id=None,
        expected_title="Tiangong space station",
    ),
]
