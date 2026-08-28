import hashlib
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone

from agents.models import SatellitePass

MAX_SATNAME_LENGTH = 200
MIN_EVENT_SECONDS = 1
MAX_EVENT_SECONDS = 6 * 60 * 60  # 6h — real passes are minutes; generous buffer
MAX_PAST_SLACK_SECONDS = 15 * 60  # allow a pass that started up to 15 min ago
MAX_FUTURE_DAYS = 30

# Control characters (excluding common whitespace) have no legitimate
# reason to appear in a satellite name and are a classic calendar/email
# injection vector (e.g. embedding characters that confuse downstream
# renderers or log parsers).
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


@dataclass
class GuardrailViolation:
    code: str  # stable machine-readable reason, for logging/eval
    user_message: str  # safe to surface to the end user


def validate_selected_pass(
    selected_pass: SatellitePass, now: datetime | None = None
) -> GuardrailViolation | None:
    """
    Sanity-checks a client-supplied SatellitePass before it's allowed to
    become a real Google Calendar event. Returns None if it looks like a
    genuine pass; a GuardrailViolation (with no network call made) if not.
    """
    now = now or datetime.now(timezone.utc)

    if selected_pass.satid <= 0:
        return GuardrailViolation(
            "invalid_satid", "That doesn't look like a valid satellite."
        )

    name = selected_pass.satname.strip()
    if not name:
        return GuardrailViolation(
            "empty_satname", "That pass is missing a satellite name."
        )
    if len(name) > MAX_SATNAME_LENGTH or _CONTROL_CHARS_RE.search(name):
        return GuardrailViolation(
            "unsafe_satname", "That satellite name isn't something I can add safely."
        )

    duration = selected_pass.endUTC - selected_pass.startUTC
    if duration < MIN_EVENT_SECONDS:
        return GuardrailViolation(
            "non_positive_duration",
            "That pass doesn't have a valid start/end time.",
        )
    if duration > MAX_EVENT_SECONDS:
        return GuardrailViolation(
            "duration_too_long",
            "That pass's duration looks wrong, so I won't add it to your calendar.",
        )

    start_dt = datetime.fromtimestamp(selected_pass.startUTC, tz=timezone.utc)
    if (now - start_dt).total_seconds() > MAX_PAST_SLACK_SECONDS:
        return GuardrailViolation(
            "pass_in_past", "That pass has already happened, so I won't add it."
        )
    if (start_dt - now).days > MAX_FUTURE_DAYS:
        return GuardrailViolation(
            "pass_too_far_out",
            "That pass is too far in the future for me to add right now.",
        )

    return None


# ── prompt-injection heuristic (defense-in-depth for calendar matching) ─

# Deliberately narrow and cheap — NOT a general-purpose injection
# firewall. Its only job is: if the latest message looks like it's trying
# to manipulate the assistant rather than genuinely answer "which
# calendar", don't let it silently auto-select a calendar via substring
# match — fall back to an explicit confirmation card instead.
_INJECTION_PATTERNS = [
    r"ignore (all |any )?(previous|prior|above) instructions",
    r"disregard (the |all )?(system|above|previous)",
    r"you are now",
    r"new instructions\s*:",
    r"system prompt",
    r"</?system>",
    r"\bact as\b.{0,30}\b(admin|root|developer)\b",
    r"reveal (your|the) (instructions|prompt)",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)


def detect_prompt_injection(text: str) -> bool:
    return bool(_INJECTION_RE.search(text or ""))


class CalendarWriteThrottle:
    """
    Per-user sliding-window limit on actual calendar *writes* (not on
    calendar_node invocations in general — list_calendars/ambiguity
    checks don't count). Same in-memory, single-instance-only tradeoff as
    mcp_servers.auth.InMemoryRateLimiter; call out for a shared store
    (Supabase/Redis) if this ever runs on more than one instance.
    """

    def __init__(self, max_writes: int = 8, window_seconds: int = 600):
        self.max_writes = max_writes
        self.window_seconds = window_seconds
        self._writes: dict[str, deque] = defaultdict(deque)

    def allow(self, clerk_user_id: str) -> bool:
        now = time.monotonic()
        window = self._writes[clerk_user_id]

        while window and now - window[0] > self.window_seconds:
            window.popleft()

        if len(window) >= self.max_writes:
            return False

        window.append(now)
        return True


# Module-level singleton — mirrors the pattern of the MCP rate limiters,
# shared across requests within one process.
calendar_write_throttle = CalendarWriteThrottle()


# ── idempotency key ──────────────────────────────────────────────────────


def compute_dedupe_key(clerk_user_id: str, satid: int, start_utc: int) -> str:
    """
    Deterministic per-(user, satellite, pass-time) key used as a Google
    Calendar private extended property so create_event can detect "we
    already added this exact pass" and skip creating a duplicate, even
    across retries/restarts (see calendar_server.py). Hashed rather than
    the raw string so it stays within Calendar's extendedProperty value
    constraints regardless of what characters clerk_user_id contains.
    """
    raw = f"{clerk_user_id}:{satid}:{start_utc}"
    return "aw_" + hashlib.sha256(raw.encode()).hexdigest()[:32]
