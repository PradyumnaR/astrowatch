def format_history(messages: list, limit: int = 6) -> str:
    return "\n".join(f"{m.role}: {m.content}" for m in messages[-limit:])
