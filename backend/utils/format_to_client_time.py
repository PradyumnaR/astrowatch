from datetime import datetime, timezone as dt_timezone
from zoneinfo import ZoneInfo


def format_to_client_time(start_utc: int, tz_name: str = "UTC") -> str:
    """
    Convert a unix timestamp (UTC) into a human-readable string in the
    client's local timezone. Used anywhere a raw epoch time would
    otherwise be handed to an LLM, which cannot reliably convert
    timestamps itself.
    """
    dt = datetime.fromtimestamp(start_utc, tz=dt_timezone.utc)
    try:
        local_dt = dt.astimezone(ZoneInfo(tz_name))
    except Exception:
        local_dt = dt.astimezone(ZoneInfo("UTC"))
    return local_dt.strftime("%A, %B %-d at %I:%M %p")
