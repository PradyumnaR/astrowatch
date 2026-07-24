"""Knowledge Agent node — dedicated RAG specialist with multi-query search."""

from agents.knowledge import search_knowledge_base
from agents.graph.state import AgentState, KnowledgeData


def _build_sub_quires(resolved_query: str, norad_id: int | None) -> list[str]:
    """
    Expand one query into a few targeted searches, since a dedicated
    Knowledge Agent can afford multiple pgvector calls per turn,
    unlike the single-search Week 2 approach.
    """

    queries = [resolved_query]

    if norad_id:
        queries.append(f"{resolved_query} recent news")
        queries.append(f"{resolved_query} mission facts")

    return queries[:3]


async def knowledge_node(state: AgentState) -> dict:
    routing = state.get("routing")
    selected_pass = state.get("selected_pass")

    norad_id = (routing.norad_id if routing else None) or (
        selected_pass.satid if selected_pass else None
    )

    resolved_query = routing.resolved_query if routing else ""

    if not resolved_query:
        return {
            "errors": ["knowledge_node_error: no resolved query available"],
            "knowledge_data": None,
        }

    try:
        sub_quires = _build_sub_quires(resolved_query, norad_id)
        all_chunks: list[dict] = []
        seen_content: set[str] = set()

        for q in sub_quires:
            chunks = await search_knowledge_base(query=q, limit=3, norad_id=norad_id)
            for c in chunks:
                content = c.get("content", "")
                if content not in seen_content:
                    seen_content.add(content)
                    all_chunks.append(c)
        citations = [
            c.get("metadata", {}).get("url", "")
            for c in all_chunks
            if c.get("metadata", {}).get("url")
        ]

        return {
            "knowledge_data": KnowledgeData(
                chunks=all_chunks[:5], summary="", citations=citations
            ),
            "tools_used": ["search_knowledge"],
            "sources": citations,
        }

    except Exception as e:
        return {"errors": [f"knowledge_node_error: {e}"], "knowledge_data": None}
