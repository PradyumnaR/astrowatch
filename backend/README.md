# Activate .venv dev environment

```
source .venv/bin/activate
```

# Install packages

```
pip install -r requirements.txt
```

# Optional — only needed if PROMPT_GUARD_ENABLED=true (see

### guardrails/injection_guard.py). Not installed by default: torch is a

### multi-hundred-MB dependency and this feature is off unless explicitly

### opted into, so it's kept out of the default `pip install -r

### requirements.txt` deploy path.

```
pip install -r requirements.txt -r requirements-ml.txt
```

# Start server

```
uv run uvicorn main:app --reload
```

# Deactivate .venv environment

```
deactivate
```

# Run mcp server

```
Example:
python -m mcp_servers.knowledge_server
```

# Open MCP inspector

```
npx @modelcontextprotocol/inspector python -m mcp_servers.knowledge_server
```
