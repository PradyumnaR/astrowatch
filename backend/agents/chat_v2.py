"""
Week 3 chat entrypoint — routes through the LangGraph multi-agent
system instead of the Week 2 manual tool loop (see chat.py for v1).
"""

import json
from dotenv import load_dotenv

load_dotenv()  # must run before importing anything that builds a ChatAnthropic client

from agents.graph.graph import get_graph
from agents.graph.state import AgentState
from agents.models import ChatMessage, Location, SatellitePass
from utils.get_reducer_fields import get_reducer_fields
from uuid import UUID
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from agents.models import PendingConfirmation

NODE_STATUS_MESSAGES = {
    "orchestrator": "Understanding your question...",
    "satellite": "Checking satellite passes...",
    "weather": "Checking sky conditions...",
    "knowledge": "Searching the knowledge base...",
    "calendar_plan": "Checking your calendar...",
    "calendar_execute": "Updating your calendar...",
    "report_writer": "Writing your answer...",
}

REDUCER_FIELDS = get_reducer_fields(AgentState)
# print(f"[stream_chat_v2] Reducer fields detected: {list(REDUCER_FIELDS.keys())}")


def make_thread_id(clerk_user_id: str, conversation_id: UUID) -> str:
    """One checkpoint thread per (user, conversation).

    The user part must ALWAYS come from the verified Clerk token, never
    from the request body — that's what stops one user from loading
    another user's conversation by guessing its conversationId.
    """
    return f"{clerk_user_id}:{conversation_id}"


async def get_chat_history(
    thread_id: str,
) -> tuple[list[ChatMessage], PendingConfirmation | None]:
    """Saved messages for a thread, plus the confirmation it's paused on (if any)."""
    config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
    snapshot = await get_graph().aget_state(config)
    messages = snapshot.values.get("messages", [])
    pending = (
        PendingConfirmation.model_validate(snapshot.interrupts[0].value)
        if snapshot.interrupts
        else None
    )
    return messages, pending


async def _stream_graph(graph_input: AgentState | Command, config: RunnableConfig):
    """Runs the graph and converts its stream into SSE events."""
    final_state = {}
    seen_report_writer_start = False
    paused = False

    async for stream_mode, chunk in get_graph().astream(
        graph_input, config=config, stream_mode=["updates", "messages"]
    ):
        if stream_mode == "updates":
            if not isinstance(chunk, dict):
                continue

            node_name = list(chunk.keys())[0]

            # NEW — the graph paused at interrupt(): send the confirmation
            # card. The stream ends right after; resume continues it.
            if node_name == "__interrupt__":
                paused = True
                payload = chunk["__interrupt__"][0].value
                elicitation_event = {"type": "elicitation", **payload}
                yield f"data: {json.dumps(elicitation_event)}\n\n"
                continue

            node_output = chunk[node_name]
            # CHANGED — a node that returns nothing streams as None
            if not isinstance(node_output, dict):
                continue

            for key, value in node_output.items():
                if key in REDUCER_FIELDS:
                    reducer = REDUCER_FIELDS[key]
                    final_state[key] = reducer(final_state.get(key, []), value)
                else:
                    final_state[key] = value

            print(f"[stream_chat_v2] Node completed: {node_name}")
            if node_output.get("errors"):
                print(f"[stream_chat_v2]   ⚠️ errors: {node_output['errors']}")

            if node_output.get("guardrail_events"):
                # Not a failure — just visibility into a guardrail
                # correcting something, for now via logs until the eval
                # pipeline has somewhere structured to send these.
                print(
                    f"[stream_chat_v2]   🛡️ guardrail: {node_output['guardrail_events']}"
                )

            # CHANGED — the old `if node_name == "calendar"` elicitation
            # block is gone: confirmations now arrive as __interrupt__ above

            # skip the "writing your answer" status text for report_writer —
            # real tokens are about to start streaming instead
            if node_name != "report_writer":
                status_msg = NODE_STATUS_MESSAGES.get(node_name, f"{node_name} done...")
                event = {"type": "status", "node": node_name, "message": status_msg}
                yield f"data: {json.dumps(event)}\n\n"

        elif stream_mode == "messages":
            if not isinstance(chunk, tuple):
                continue
            message_chunk, metadata = chunk
            if metadata.get("langgraph_node") != "report_writer":
                continue  # ignore tokens from other model calls (e.g. orchestrator)

            if not seen_report_writer_start:
                seen_report_writer_start = True
                start_event = {
                    "type": "status",
                    "node": "report_writer",
                    "message": "Writing your answer...",
                }
                print("[stream_chat_v2] Report writer started streaming tokens")
                yield f"data: {json.dumps(start_event)}\n\n"

            piece = message_chunk.content
            if isinstance(piece, list):
                piece = "".join(
                    b if isinstance(b, str) else str(b.get("text", "")) for b in piece
                )

            if piece:
                token_event = {"type": "token", "text": piece}
                yield f"data: {json.dumps(token_event)}\n\n"

    # NEW — a paused turn has no answer yet, so no "final" event
    if paused:
        print("[stream_chat_v2] Paused for user confirmation")
        return

    print(
        f"[stream_chat_v2] Graph complete. Tools used: {final_state.get('tools_used', [])}"
    )
    final_event = {
        "type": "final",
        "sources": final_state.get("sources", []),
        "toolsUsed": (
            [] if final_state.get("errors") else final_state.get("tools_used", [])
        ),
    }
    print(f"[stream_chat_v2]   → yielding final event: {final_event}")
    yield f"data: {json.dumps(final_event)}\n\n"


async def stream_resume_v2(thread_id: str, choice: str):
    """Continue a paused thread with the user's choice.

    No new input: selected_pass, clerk_user_id and the pending action all
    come from the saved checkpoint, so the client can't swap them at
    confirmation time. Only the button value comes from the request, and
    calendar_confirm validates it against the options it offered.
    """
    print(f"\n[stream_chat_v2] Resuming thread {thread_id}")
    config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
    async for event in _stream_graph(Command(resume=choice), config):
        yield event


async def stream_chat_with_tools_v2(
    message: str,
    thread_id: str,
    location: Location | None = None,
    selected_pass: SatellitePass | None = None,
    clerk_user_id: str | None = None,
):
    print(f"\n[stream_chat_v2] Starting turn on thread {thread_id}")

    initial_state: AgentState = {
        # Only the NEW message — the checkpointer loads the saved history
        # and append_messages adds this to the end of it.
        "messages": [ChatMessage(role="user", content=message)],
        "location": location,
        "selected_pass": selected_pass,
        "clerk_user_id": clerk_user_id,
        "routing": None,
        "passes_data": None,
        "weather_data": None,
        "knowledge_data": None,
        "calendar_data": None,
        "pending_calendar_action": None,
        "tools_used": None,  # None = reset this turn
        "sources": None,
        "errors": None,
        "guardrail_events": None,
        "final_response": None,
    }

    # Tells the checkpointer which saved conversation to load and update
    config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
    async for event in _stream_graph(initial_state, config):
        yield event
