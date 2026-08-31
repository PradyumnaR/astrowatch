"""
Week 3 chat entrypoint — routes through the LangGraph multi-agent
system instead of the Week 2 manual tool loop (see chat.py for v1).
"""

import json
from dotenv import load_dotenv

load_dotenv()  # must run before importing anything that builds a ChatAnthropic client

from agents.graph.graph import compiled_graph
from agents.graph.state import AgentState
from agents.models import ChatMessage, Location, SatellitePass
from utils.get_reducer_fields import get_reducer_fields

NODE_STATUS_MESSAGES = {
    "orchestrator": "Understanding your question...",
    "satellite": "Checking satellite passes...",
    "weather": "Checking sky conditions...",
    "knowledge": "Searching the knowledge base...",
    "calendar": "Checking your calendar...",
    "report_writer": "Writing your answer...",
}

REDUCER_FIELDS = get_reducer_fields(AgentState)
# print(f"[stream_chat_v2] Reducer fields detected: {list(REDUCER_FIELDS.keys())}")


async def stream_chat_with_tools_v2(
    messages: list[ChatMessage],
    location: Location | None = None,
    selected_pass: SatellitePass | None = None,
    clerk_user_id: str | None = None,
):
    print(f"\n[stream_chat_v2] Starting stream — {len(messages)} messages")

    initial_state: AgentState = {
        "messages": messages,
        "location": location,
        "selected_pass": selected_pass,
        "clerk_user_id": clerk_user_id,
        "routing": None,
        "passes_data": None,
        "weather_data": None,
        "knowledge_data": None,
        "calendar_data": None,
        "tools_used": [],
        "sources": [],
        "errors": [],
        "guardrail_events": [],
        "final_response": None,
    }

    final_state = {}
    seen_report_writer_start = False

    async for stream_mode, chunk in compiled_graph.astream(
        initial_state, stream_mode=["updates", "messages"]
    ):
        if stream_mode == "updates":
            if not isinstance(chunk, dict):
                continue

            node_name = list(chunk.keys())[0]
            node_output = chunk[node_name]

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

            # NEW — intercept calendar_node's elicitation case and emit
            # a dedicated event type instead of the normal status text
            if node_name == "calendar":
                calendar_data = node_output.get("calendar_data")
                if calendar_data and calendar_data.action == "needs_confirmation":
                    elicitation_event = {
                        "type": "elicitation",
                        "question": "Which calendar should I use?",
                        "options": calendar_data.calendar_options,
                    }
                    yield f"data: {json.dumps(elicitation_event)}\n\n"
                    continue  # skip the normal status_msg block below for this node

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

    print(
        f"[stream_chat_v2] Graph complete. Tools used: {final_state.get('tools_used', [])}"
    )
    # if final_state.get("errors"):
    #     print(f"[stream_chat_v2]   ⚠️ accumulated errors: {final_state['errors']}")
    #     yield f"data: {json.dumps({'type': 'error', 'message': "We couldn't process your request right now. Please try again in a moment"})}\n\n"

    final_event = {
        "type": "final",
        "sources": final_state.get("sources", []),
        "toolsUsed": (
            [] if final_state.get("errors") else final_state.get("tools_used", [])
        ),
    }
    print(f"[stream_chat_v2]   → yielding final event: {final_event}")
    yield f"data: {json.dumps(final_event)}\n\n"
