import asyncio
import os
from typing import Literal, cast

import anthropic
from anthropic.types import MessageParam, TextBlock, ToolResultBlockParam, ToolUseBlock
from agents.models import ChatMessage, SatellitePass, Location
from dotenv import load_dotenv

from tools.execute_tools import execute_tool
from utils.build_system_prompt import build_system_prompt
from tools.tools_list import TOOLS

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

MODEL = "claude-sonnet-4-6"
MAX_ITERATIONS = 5


async def chat_with_tools(
    messages: list[ChatMessage],
    location: Location | None = None,
    selected_pass: SatellitePass | None = None,
) -> dict:
    """
    Chat with Claude using agentic tool loop.

    Flow:
    1. Build system prompt with context
    2. Call Claude API
    3. If Claude wants tools → execute in parallel
    4. Add results to messages → loop back to 2
    5. When Claude returns end_turn → return response
    """
    system = build_system_prompt(location, selected_pass)
    tools_used = []
    norad_id = selected_pass.satid if selected_pass else None

    anthropic_messages: list[MessageParam] = [
        MessageParam(role=cast(Literal["user", "assistant"], m.role), content=m.content)
        for m in messages
    ]

    print(f"\nChat started — {len(messages)} messages")

    iteration = 0

    # ── agentic loop ──────────────────────────────────
    while iteration < MAX_ITERATIONS:
        iteration += 1
        print(f"\nIteration {iteration}/{MAX_ITERATIONS}")

        # claud call
        response = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=system,
            tools=TOOLS,
            messages=anthropic_messages,
        )

        print(f"Stop reason: {response.stop_reason}")

        if response.stop_reason == "end_turn":
            content = ""
            for block in response.content:
                if isinstance(block, TextBlock):
                    content = block.text
                    break

            print(f"Done in {iteration} iterations")
            print(f"Tools used: {tools_used}")

            return {
                "content": content,
                "toolsUsed": tools_used,
            }

        if response.stop_reason == "tool_use":
            # add assistant response (list of blocks)
            anthropic_messages.append(
                MessageParam(
                    role="assistant",
                    content=response.content,  # ← list of blocks ✅
                )
            )
            tool_calls = [
                block for block in response.content if isinstance(block, ToolUseBlock)
            ]

            print(f"Claude called {len(tool_calls)} tool(s)")

            # execute in parallel
            tool_results_data = await asyncio.gather(
                *[
                    execute_tool(
                        tool_name=block.name,
                        tool_input=cast(dict, block.input),
                        location=location,
                        norad_id=norad_id,
                    )
                    for block in tool_calls
                ]
            )

            tools_used.extend([b.name for b in tool_calls])

            tool_results = [
                ToolResultBlockParam(
                    type="tool_result",
                    tool_use_id=block.id,
                    content=result,
                )
                for block, result in zip(tool_calls, tool_results_data)
            ]

            anthropic_messages.append(
                MessageParam(
                    role="user",
                    content=tool_results,  # ← list of dicts ✅
                )
            )

            continue
        # unexpected stop reason
        print(f"Unexpected stop reason: {response.stop_reason}")
        break

    # max iterations reached
    print(f"Warning: reached max iterations ({MAX_ITERATIONS})")
    return {
        "content": "I needed more time to research that. Please try again.",
        "toolsUsed": tools_used,
    }
