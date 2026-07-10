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
