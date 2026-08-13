# test_weather_mcp.py
from fastmcp import Client
from fastmcp.client.auth import BearerAuth
import asyncio


async def main():
    async with Client(
        "http://localhost:8000/mcp/weather",
        auth=BearerAuth(token="sk-aw-wea-5fcf8fa18faef9d63f9dae80a1a25d12"),
    ) as client:
        result = await client.call_tool(
            "get_viewing_conditions",
            {"lat": 34.18, "lng": -118.32},
        )
        print(result)


asyncio.run(main())
