"""Report Writer Agent — synthesizes all specialist outputs into one
final response. Must handle partial state gracefully: any of
passes_data / weather_data / knowledge_data may be None, either because
that agent wasn't called (single-intent query) or because it failed.
"""

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agents.graph.state import AgentState

REPORT_WRITER_MODEL = "claude-sonnet-4-6"

REPORT_WRITER_SYSTEM_PROMPT = """You are the response synthesizer for \
AstroWatch, a satellite pass tracking assistant. You've been given \
outputs from up to three specialist agents (satellite passes, weather \
conditions, and space knowledge). Not all three may be present — only \
synthesize from what's actually provided.

Rules:
- Write a natural, conversational markdown response answering the \
user's original question.
- If both pass data and weather data are present, combine them: state \
the best pass, then note whether conditions favor actually seeing it \
(e.g. good elevation but heavy cloud cover means low visibility).
- If an agent's data is missing due to an error, don't mention the \
error mechanically — just work with what's available, and if nothing \
useful came back for something the user clearly asked about, say so \
plainly and simply (e.g. "I couldn't get current weather data — try \
again in a moment").
- Cite knowledge sources naturally if knowledge_data is present (e.g. \
"according to NASA...").
- Keep the response focused and readable — a few short paragraphs, not \
an exhaustive dump of every field.
"""

_writer_model = ChatAnthropic(
    model_name=REPORT_WRITER_MODEL,
    temperature=0,
    timeout=30,  # fail fast rather than hang
    max_retries=2,
    stop=None,
)


def _format_context(state: AgentState) -> str:
    parts = []
    routing = state.get("routing")
    parts.append(f"\nUser's question: {routing.resolved_query if routing else ''}")

    selected_pass = state.get("selected_pass")
    if selected_pass:
        parts.append(
            f"\nCurrently selected satellite: {selected_pass.satname} "
            f"(NORAD {selected_pass.satid})"
        )

    location = state.get("location")
    if location:
        parts.append(f"\nObserver location: {location.name}")

    passes_data = state.get("passes_data")
    if passes_data:
        parts.append(
            f"\nSatellite pass data: \nBest pass: {passes_data.best_pass}\n"
            f"Tips: {passes_data.viewing_tips}"
        )

    weather_data = state.get("weather_data")
    if weather_data:
        parts.append(
            f"\nWeather data:\n{weather_data.conditions_summary}\n"
            f"Recommendation: {weather_data.go_no_go}"
        )

    knowledge_data = state.get("knowledge_data")
    if knowledge_data and knowledge_data.chunks:
        chunk_texts = "\n".join(
            f"- {c.get('content', '')[:300]}" for c in knowledge_data.chunks
        )
        parts.append(f"\nKnowledge base results:\n{chunk_texts}")

    errors = state.get("errors", [])
    if errors:
        parts.append(f"\n(Internal note — some agents had issues: {errors})")

    return "\n".join(parts)


async def report_writer_node(state: AgentState) -> dict:
    context = _format_context(state)
    full_content = ""

    try:
        async for chunk in _writer_model.astream(
            [
                SystemMessage(content=REPORT_WRITER_SYSTEM_PROMPT),
                HumanMessage(content=context),
            ]
        ):
            piece = chunk.content
            if isinstance(piece, list):
                piece = "".join(
                    b if isinstance(b, str) else str(b.get("text", "")) for b in piece
                )
            full_content += piece

        return {"final_response": full_content}
    except Exception as e:
        return {
            "errors": [f"report_writer_error: {e}"],
            "final_response": "I ran into an issue putting together your answer. Please try again.",
        }
