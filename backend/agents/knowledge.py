# agents/knowledge.py
from rag.search import search


async def search_knowledge_base(
    query: str,
    limit: int = 3,
    filter_source: str | None = None,
    norad_id: int | None = None,
) -> list[dict]:
    # enrich query with satellite context
    enriched_query = query
    if norad_id:
        sat_names = {
            25544: "ISS International Space Station",
            48274: "Tiangong CSS Chinese Space Station",
            33591: "NOAA-19 weather satellite",
            25338: "NOAA-15 weather satellite",
            20580: "Hubble Space Telescope",
        }
        sat_name = sat_names.get(norad_id, "")
        if sat_name:
            enriched_query = f"{sat_name} {query}"

    print(f"Knowledge search: '{enriched_query[:80]}'")

    results = await search(
        query=enriched_query,
        limit=limit,
        filter_source=filter_source,
    )

    print(f"Found {len(results)} chunks")
    return results


def format_chunks_for_claude(chunks: list[dict]) -> str:
    """
    Format knowledge chunks into a string
    Claude can read and cite in its response.
    """
    if not chunks:
        return "No relevant knowledge found."

    formatted = []
    for i, chunk in enumerate(chunks, 1):
        source = chunk.get("source", "unknown")
        metadata = chunk.get("metadata", {})
        content = chunk.get("content", "")
        title = metadata.get("title", "")
        url = metadata.get("url", "")

        # format source label
        source_labels = {
            "nasa_apod": "NASA",
            "spaceflight_news": "Spaceflight News",
            "wikipedia": "Wikipedia",
        }
        source_label = source_labels.get(source, source)

        formatted.append(
            f"[{i}] {source_label}"
            + (f" — {title}" if title else "")
            + f"\n{content}"
            + (f"\nSource: {url}" if url else "")
        )

    return "\n\n".join(formatted)
