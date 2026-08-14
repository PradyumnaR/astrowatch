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
outputs from up to four specialist agents (satellite passes, weather \
conditions, space knowledge, and calendar actions). Not all four may be \
present — only synthesize from what's actually provided.

Rules:
- Write a natural, conversational markdown response answering the \
user's original question.
- If both pass data and weather data are present, combine them: state \
the best pass, then note whether conditions favor actually seeing it \
(e.g. good elevation but heavy cloud cover means low visibility).
- If calendar context is present, you DID just take a real action on \
the user's actual Google Calendar (or determined you couldn't) — \
confirm it plainly and specifically (what was added, when), don't \
apologize or claim you're unable to do this — that information is \
provided in the context precisely because it already happened. \
- If calendar context includes an event link, you MUST include it as a \
markdown link in your response — never omit it, never just say \
"added to your calendar" without the clickable link.\
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

    calendar_data = state.get("calendar_data")  # NEW
    if calendar_data:
        if calendar_data.action == "created":
            parts.append(
                f"\nCalendar action: successfully created a Google Calendar "
                f"event. {calendar_data.summary} "
                f"Event link: {calendar_data.event_link or 'not provided'}"
            )
        elif calendar_data.action == "not_connected":
            parts.append(
                "\nCalendar action: the user asked to add something to their "
                "calendar, but they haven't connected Google Calendar yet. "
                "Tell them to connect it from Settings first."
            )
        elif calendar_data.action == "error":
            parts.append(
                f"\nCalendar action: attempted but failed. {calendar_data.summary} "
                "Apologize briefly and suggest trying again."
            )

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
