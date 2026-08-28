"""
Deterministic, non-LLM policy enforcement on top of orchestrator_node's
RoutingDecision — OWASP ASI01 (Agent Goal Hijack) mitigation.

The orchestrator's system prompt already says "only route to calendar on
an explicit request" and "never combine calendar with all", but that's a
request to the model, not a guarantee — the same message that might be
trying to manipulate the router is the one the router is classifying.
Everything here re-checks the router's own output with plain code, so a
policy violation gets corrected before it reaches calendar_node,
regardless of whether the model got it wrong through genuine
misclassification or a deliberate injection attempt.
"""

import re
from dataclasses import dataclass, field

from agents.graph.state import RoutingDecision
from app_guardrails.injection_guard import classify_injection

MAX_RESOLVED_QUERY_LENGTH = 2000

# Deliberately broad. False positives here just mean a normal read-only
# turn instead of a calendar write — mildly annoying, fully recoverable.
# False negatives (missing real calendar intent) are the worse failure
# mode, since they'd silently disable a feature the user actually asked
# for — so this errs toward over-matching.
_CALENDAR_INTENT_RE = re.compile(
    r"\b(add|save|schedule|remind|remember|put|book|create)\b[^.?!]{0,40}\b"
    r"(calendar|event|reminder)\b"
    r"|"
    r"\bcalendar\b[^.?!]{0,40}\b(add|save|please)\b",
    re.IGNORECASE,
)

# Safe, read-only fallback — mirrors graph.py's own
# route_after_orchestrator default for a missing/failed routing decision.
_SAFE_FALLBACK_AGENTS = ["satellite", "weather", "knowledge"]


@dataclass
class RoutingPolicyResult:
    routing: RoutingDecision
    overridden: bool = False
    reasons: list[str] = field(default_factory=list)


def enforce_routing_policy(
    routing: RoutingDecision, latest_message: str
) -> RoutingPolicyResult:
    reasons: list[str] = []
    agents = list(routing.agents_to_call)
    intent = routing.intent
    resolved_query = routing.resolved_query
    latest_message = latest_message or ""

    if len(resolved_query) > MAX_RESOLVED_QUERY_LENGTH:
        resolved_query = resolved_query[:MAX_RESOLVED_QUERY_LENGTH]
        reasons.append("resolved_query_truncated")

    if "calendar" in agents:
        has_intent_language = bool(_CALENDAR_INTENT_RE.search(latest_message))
        injection_verdict = classify_injection(latest_message)

        if injection_verdict.is_injection:
            agents = [a for a in agents if a != "calendar"]
            reasons.append(
                f"calendar_blocked_suspected_injection:{injection_verdict.method}"
            )
        elif not has_intent_language:
            agents = [a for a in agents if a != "calendar"]
            reasons.append("calendar_blocked_no_explicit_intent_language")
        elif len(agents) > 1:
            # calendar is a write action — never bundle it with read
            # agents in the same turn, regardless of what the model
            # returned for agents_to_call.
            agents = ["calendar"]
            reasons.append("calendar_isolated_from_other_agents")

        if not agents:
            # calendar was the only agent chosen and it just got
            # blocked — fall back to a safe read-only default rather
            # than returning a routing decision that fans out to
            # nothing.
            agents = list(_SAFE_FALLBACK_AGENTS)
            intent = "all"
            reasons.append("fallback_to_all_after_calendar_block")

    if reasons:
        routing = routing.model_copy(
            update={
                "agents_to_call": agents,
                "intent": intent,
                "resolved_query": resolved_query,
            }
        )

    return RoutingPolicyResult(
        routing=routing, overridden=bool(reasons), reasons=reasons
    )
