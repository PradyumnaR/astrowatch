"""
Prompt-injection / jailbreak detection for the orchestrator boundary.

Uses Meta's Llama Prompt Guard 2 (86M) when enabled — a small, purpose-
trained classifier, a meaningfully stronger signal than a keyword/regex
list since it generalizes to paraphrased or obfuscated attempts a fixed
pattern list would miss.

This is deliberately heavier than everything else in guardrails/ — it
needs `transformers` + `torch` (see requirements-ml.txt, NOT bundled into
the default requirements.txt) and downloads a gated model from Hugging
face on first use (accept the license at
https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M and set
HF_TOKEN in your environment). That's real memory + cold-start cost on a small
Render instance, so it's opt-in via PROMPT_GUARD_ENABLED — unset/false
uses the regex heuristic from calendar_guardrails.py instead, unchanged
in behavior from last week.

NOTE: the exact label strings Prompt Guard 2 returns (e.g. "LABEL_1" vs
"MALICIOUS" vs "JAILBREAK") depend on how the checkpoint's config.json
maps ids to labels — verify against a real response the first time this
runs with PROMPT_GUARD_ENABLED=true, same as every other "confirm
against a real response" callout elsewhere in this codebase.
"""

import os
from dataclasses import dataclass
from functools import lru_cache

PROMPT_GUARD_MODEL_ID = "meta-llama/Llama-Prompt-Guard-2-86M"
PROMPT_GUARD_ENABLED = os.getenv("PROMPT_GUARD_ENABLED", "false").lower() == "true"

# Labels observed across Prompt Guard model card revisions — checked
# case-insensitively against whatever the pipeline returns.
_MALICIOUS_LABELS = {"label_1", "malicious", "injection", "jailbreak"}


@dataclass
class InjectionVerdict:
    is_injection: bool
    score: float
    method: str  # "prompt_guard" | "regex_fallback"


@lru_cache(maxsize=1)
def _get_classifier():
    """Lazily loads the model once per process — only ever called when
    PROMPT_GUARD_ENABLED is true, so importing this module (or running
    with the flag off, which is the default) never requires transformers
    or torch to be installed at all."""
    from transformers import pipeline

    return pipeline("text-classification", model=PROMPT_GUARD_MODEL_ID)


def _regex_fallback(text: str) -> InjectionVerdict:
    # Local import — keeps this module usable even if calendar_guardrails
    # ever gains heavier deps of its own.
    from app_guardrails.calendar_guardrails import detect_prompt_injection

    flagged = detect_prompt_injection(text)
    return InjectionVerdict(flagged, 1.0 if flagged else 0.0, "regex_fallback")


def classify_injection(text: str) -> InjectionVerdict:
    if not text:
        return InjectionVerdict(False, 0.0, "regex_fallback")

    print(f"PROMPT_GUARD_ENABLED: {PROMPT_GUARD_ENABLED} ")

    if not PROMPT_GUARD_ENABLED:
        return _regex_fallback(text)

    try:
        classifier = _get_classifier()
        result = classifier(text[:512])[0]  # model has a fixed context window
        is_malicious = result["label"].lower() in _MALICIOUS_LABELS
        print(f"Classifier Result{result} \nis_malicious: {is_malicious}")
        return InjectionVerdict(is_malicious, float(result["score"]), "prompt_guard")
    except Exception as e:
        print(f"Falling back to regex vallidation because of error: \n{e}")
        # A classifier failure (model not downloaded, OOM, etc.) should
        # never take the orchestrator down with it — fail open to the
        # cheap heuristic rather than blocking every routing decision.
        return _regex_fallback(text)
