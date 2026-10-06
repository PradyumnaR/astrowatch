"""
Trajectory dataset for orchestrator_node (agents/graph/orchestrator_node.py).

Each case is a conversation (optionally with a selected satellite) and the
RoutingDecision orchestrator_node should produce: which specialist agents
get called, and which NORAD id (if any) gets resolved. Covers every
routing rule in ORCHESTRATOR_SYSTEM_PROMPT — single-intent, multi-intent
("all"), explicit calendar intent (create/delete/update), named-satellite
override, multi-turn pronoun resolution, and the deterministic
confirmation-reply shortcut (is_calendar_confirmation_reply) that must
never touch the router LLM at all.
"""

from dataclasses import dataclass, field
from typing import Literal, Optional

from agents.models import ChatMessage

# NORAD ID of the ISS — used as the default "currently selected" satellite
# across cases, matching satellite_node.py's own DEFAULT_NORAD_ID.
ISS_NORAD_ID = 25544
HUBBLE_NORAD_ID = 20580


def _msgs(*turns: tuple[str, str]) -> list[ChatMessage]:
    return [ChatMessage(role=role, content=content) for role, content in turns]


@dataclass
class OrchestratorCase:
    id: str
    messages: list[ChatMessage]
    selected_pass_norad_id: Optional[int]
    expected_agents: list[Literal["satellite", "weather", "knowledge", "calendar"]]
    expected_norad_id: Optional[int] = None
    # True only for the deterministic confirmation-reply shortcut, where
    # orchestrator_node must resolve routing without ever calling the
    # router LLM — see is_calendar_confirmation_reply's docstring.
    expect_zero_llm_calls: bool = False


ORCHESTRATOR_CASES: list[OrchestratorCase] = [
    OrchestratorCase(
        id="single_intent_passes",
        messages=_msgs(("user", "When can I see the ISS tonight?")),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["satellite"],
    ),
    OrchestratorCase(
        id="single_intent_weather",
        messages=_msgs(("user", "Will it be cloudy tonight for viewing?")),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["weather"],
    ),
    OrchestratorCase(
        id="single_intent_knowledge",
        messages=_msgs(("user", "What is the ISS's mission?")),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["knowledge"],
    ),
    OrchestratorCase(
        id="multi_intent_all",
        messages=_msgs(
            (
                "user",
                "Plan my ISS viewing this week and tell me about recent missions",
            )
        ),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["satellite", "weather", "knowledge"],
    ),
    OrchestratorCase(
        id="calendar_create_explicit",
        messages=_msgs(("user", "Add this pass to my calendar")),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["calendar"],
    ),
    OrchestratorCase(
        id="calendar_delete_explicit",
        messages=_msgs(("user", "Delete this pass from my calendar")),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["calendar"],
    ),
    OrchestratorCase(
        id="calendar_update_explicit",
        messages=_msgs(
            ("user", "Change the reminder on my calendar invite to 20 minutes before")
        ),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["calendar"],
    ),
    OrchestratorCase(
        id="named_satellite_overrides_selected",
        messages=_msgs(("user", "When can I see Hubble next?")),
        selected_pass_norad_id=ISS_NORAD_ID,  # ISS selected, Hubble named instead
        expected_agents=["satellite"],
        expected_norad_id=HUBBLE_NORAD_ID,
    ),
    OrchestratorCase(
        id="pronoun_resolution_multiturn",
        messages=_msgs(
            ("user", "When can I see the ISS tonight?"),
            ("assistant", "ISS passes at 9:14 PM, 78° elevation."),
            ("user", "What about tomorrow?"),
        ),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["satellite"],
    ),
    OrchestratorCase(
        id="confirmation_reply_yes",
        messages=_msgs(
            ("user", "Delete this pass from my calendar"),
            ("assistant", "Delete your AstroWatch invite for the ISS pass?"),
            ("user", "yes"),
        ),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["calendar"],
        expect_zero_llm_calls=True,
    ),
    OrchestratorCase(
        id="confirmation_reply_no",
        messages=_msgs(
            ("user", "Delete this pass from my calendar"),
            ("assistant", "Delete your AstroWatch invite for the ISS pass?"),
            ("user", "no, never mind"),
        ),
        selected_pass_norad_id=ISS_NORAD_ID,
        expected_agents=["calendar"],
        expect_zero_llm_calls=True,
    ),
]
