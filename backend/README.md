# Activate .venv dev environment

```
source .venv/bin/activate
```

# Install packages

```
pip install -r requirements.txt
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
