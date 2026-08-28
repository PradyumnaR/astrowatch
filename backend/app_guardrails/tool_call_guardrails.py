"""
Tool-call parameter validation — OWASP ASI02 (Tool Misuse & Exploitation)
mitigation for satellite_node and weather_node, built on the real
guardrails-ai library.

Both nodes call real external APIs (N2YO for satellite passes, a
weather provider) with parameters that are either the orchestrator
LLM's own inference (norad_id) or client-supplied (lat/lng) — nothing
upstream of either node checks either is sane before the call goes
out. A hallucinated norad_id or an out-of-range coordinate would be
sent straight to a paid third-party API exactly as-is.

Known tradeoff, documented rather than hidden: guardrails-ai's
Guard.validate() attempts to emit an OpenTelemetry trace span to
Guardrails AI's own hosted collector on every single call, and this
installed version (0.11.0) has no working switch to fully disable
it — settings.disable_tracing does not cover the separate "hub
telemetry" layer that actually makes this network call. Verified this
does NOT add per-call latency in a long-lived process (20 consecutive
calls measured at ~11ms each) — the multi-second retry/backoff only
fires once, at process shutdown, when the batched span exporter
flushes queued spans. Accepted deliberately rather than avoided.
"""

from guardrails import Guard
from guardrails.errors import ValidationError as GuardrailsValidationError
from guardrails.types.on_fail import OnFailAction
from guardrails.validator_base import Validator, register_validator
from guardrails.classes.validation.validation_result import (
    FailResult,
    PassResult,
    ValidationResult,
)


@register_validator(name="astrowatch/numeric-range", data_type="string")
class NumericRange(Validator):
    """
    Guard.validate() only accepts string input, so callers stringify
    the value first; this parses it back to int/float and checks it
    falls within [min_value, max_value].
    """

    def __init__(
        self,
        min_value: float,
        max_value: float,
        value_type: str = "float",
        **kwargs,
    ):
        super().__init__(
            min_value=min_value, max_value=max_value, value_type=value_type, **kwargs
        )
        self._min_value = min_value
        self._max_value = max_value
        self._value_type = value_type

    def _validate(self, value, metadata) -> ValidationResult:
        try:
            parsed = int(value) if self._value_type == "int" else float(value)
        except (TypeError, ValueError):
            return FailResult(
                error_message=f"{value!r} is not a valid {self._value_type}"
            )

        if parsed < self._min_value or parsed > self._max_value:
            return FailResult(
                error_message=(
                    f"{parsed} is outside the allowed range "
                    f"[{self._min_value}, {self._max_value}]"
                )
            )
        return PassResult()


# Real NORAD catalog numbers are positive and, as of 2026, comfortably
# under 6 digits — generous upper bound so real satellites are never
# rejected, while still catching negative/zero/absurd hallucinated IDs.
_norad_id_guard = Guard().use(
    NumericRange(
        min_value=1, max_value=99999, value_type="int", on_fail=OnFailAction.EXCEPTION
    )
)
_latitude_guard = Guard().use(
    NumericRange(
        min_value=-90, max_value=90, value_type="float", on_fail=OnFailAction.EXCEPTION
    )
)
_longitude_guard = Guard().use(
    NumericRange(
        min_value=-180,
        max_value=180,
        value_type="float",
        on_fail=OnFailAction.EXCEPTION,
    )
)


class ToolParamError(Exception):
    """Raised when a tool-call parameter fails validation. Callers
    catch this one exception type rather than reaching into
    guardrails-ai's own exception hierarchy directly."""


def validate_norad_id(norad_id: int) -> None:
    _run_guard(_norad_id_guard, norad_id, "norad_id")


def validate_latitude(lat: float) -> None:
    _run_guard(_latitude_guard, lat, "lat")


def validate_longitude(lng: float) -> None:
    _run_guard(_longitude_guard, lng, "lng")


def _run_guard(guard: Guard, value, param_name: str) -> None:
    try:
        guard.validate(str(value))
    except GuardrailsValidationError as e:
        raise ToolParamError(f"{param_name}: {e}") from e
