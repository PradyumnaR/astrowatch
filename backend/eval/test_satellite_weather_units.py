"""
Step 3.5 — satellite_node / weather_node unit & contract tests.

Plain pytest, no LLM judge, no DeepEval: these are pure-function and
guardrail-rejection checks (_go_no_go's thresholds, _build_viewing_tips'
output shape, tool_call_guardrails' range validation, and the two nodes'
own early-return-on-invalid-input paths), all deterministic and free of
any network or model call — the cheapest tier in the pipeline.
"""

import asyncio

import pytest

from agents.graph.satellite_node import _build_viewing_tips, satellite_node
from agents.graph.weather_node import _go_no_go, weather_node
from agents.graph.state import AgentState
from agents.models import Location
from app_guardrails.tool_call_guardrails import (
    ToolParamError,
    validate_latitude,
    validate_longitude,
    validate_norad_id,
)


def _base_state(**overrides) -> AgentState:
    state: AgentState = {
        "messages": [],
        "location": None,
        "selected_pass": None,
        "clerk_user_id": "eval-test-user",
        "routing": None,
        "passes_data": None,
        "weather_data": None,
        "knowledge_data": None,
        "calendar_data": None,
        "tools_used": [],
        "sources": [],
        "errors": [],
        "guardrail_events": [],
        "final_response": None,
    }
    state.update(overrides)
    return state


# ── weather_node._go_no_go ───────────────────────────────────────────


@pytest.mark.parametrize(
    "cloud_cover,expected",
    [
        (None, "marginal"),
        (0, "go"),
        (29.9, "go"),
        (30, "marginal"),
        (69.9, "marginal"),
        (70, "no-go"),
        (100, "no-go"),
    ],
)
def test_go_no_go_thresholds(cloud_cover, expected):
    assert _go_no_go(cloud_cover) == expected


# ── satellite_node._build_viewing_tips ───────────────────────────────


def test_build_viewing_tips_no_pass():
    assert (
        _build_viewing_tips(None, "UTC")
        == "No upcoming passes found in the requested window"
    )


def test_build_viewing_tips_with_pass():
    best_pass = {
        "maxEl": 78,
        "startAzCompass": "NE",
        "startUTC": 2_000_000_000,
    }
    tip = _build_viewing_tips(best_pass, "UTC")
    assert "78°" in tip
    assert "NE" in tip
    assert "reaches" in tip


def test_build_viewing_tips_missing_start_time():
    best_pass = {"maxEl": 45, "startAzCompass": "SW"}
    tip = _build_viewing_tips(best_pass, "UTC")
    assert "an unknown time" in tip


# ── tool_call_guardrails range validation ────────────────────────────


@pytest.mark.parametrize("norad_id", [1, 25544, 99999])
def test_validate_norad_id_accepts_valid(norad_id):
    validate_norad_id(norad_id)  # must not raise


@pytest.mark.parametrize("norad_id", [0, -1, 100000, -25544])
def test_validate_norad_id_rejects_invalid(norad_id):
    with pytest.raises(ToolParamError):
        validate_norad_id(norad_id)


@pytest.mark.parametrize("lat", [-90, 0, 34.18, 90])
def test_validate_latitude_accepts_valid(lat):
    validate_latitude(lat)  # must not raise


@pytest.mark.parametrize("lat", [-90.1, 90.1, 999])
def test_validate_latitude_rejects_invalid(lat):
    with pytest.raises(ToolParamError):
        validate_latitude(lat)


@pytest.mark.parametrize("lng", [-180, 0, -118.31, 180])
def test_validate_longitude_accepts_valid(lng):
    validate_longitude(lng)  # must not raise


@pytest.mark.parametrize("lng", [-180.1, 180.1, 999])
def test_validate_longitude_rejects_invalid(lng):
    with pytest.raises(ToolParamError):
        validate_longitude(lng)


# ── satellite_node / weather_node early-return contracts ────────────
# Both guardrail checks happen before any network call, so these paths
# are exercised with no mocking at all.


def test_satellite_node_missing_location():
    state = _base_state(location=None)
    result = asyncio.run(satellite_node(state))
    assert result["passes_data"] is None
    assert any("no location provided" in e for e in result["errors"])


def test_satellite_node_rejects_invalid_norad_id():
    state = _base_state(
        location=Location(lat=34.18, lng=-118.31, name="Burbank, CA"),
        routing=None,
    )
    # No selected_pass and no routing.norad_id both missing would fall back
    # to DEFAULT_NORAD_ID (a valid ISS id), so force an invalid one via a
    # routing decision instead.
    from agents.graph.state import RoutingDecision

    state["routing"] = RoutingDecision(
        intent="passes",
        agents_to_call=["satellite"],
        reasoning="test",
        resolved_query="test",
        norad_id=-1,
    )
    result = asyncio.run(satellite_node(state))
    assert result["passes_data"] is None
    assert any("satellite_node_guardrail" in e for e in result["errors"])


def test_weather_node_missing_location():
    state = _base_state(location=None)
    result = asyncio.run(weather_node(state))
    assert result["weather_data"] is None
    assert any("no location provided" in e for e in result["errors"])


def test_weather_node_rejects_invalid_latitude():
    state = _base_state(location=Location(lat=999, lng=-118.31, name="Nowhere"))
    result = asyncio.run(weather_node(state))
    assert result["weather_data"] is None
    assert any("weather_node_guardrail" in e for e in result["errors"])
