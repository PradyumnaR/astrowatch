# test_knowledge_mcp.py
from fastmcp import Client
from fastmcp.client.auth import BearerAuth
import asyncio


async def main():
    async with Client(
        "http://localhost:8000/mcp/knowledge",
        auth=BearerAuth(token="sk-aw-kno-dc569b5a05c6c13a5cf64a1eecb63250"),
    ) as client:
        result = await client.call_tool(
            "search_space_knowledge",
            {"query": "how do satellites deorbit", "limit": 3},
        )
        print(result)


asyncio.run(main())
