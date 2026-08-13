from fastmcp import Client
from fastmcp.client.auth import BearerAuth
import asyncio


async def main():
    async with Client(
        "http://localhost:8000/mcp/satellite",
        auth=BearerAuth(token="sk-aw-sat-711021338145f0677e2037ab430d38c6"),
    ) as client:
        result = await client.call_tool(
            "get_visible_satellites",
            {"lat": 34.18, "lng": -118.32, "category": 2},
        )
        print(result)


asyncio.run(main())
