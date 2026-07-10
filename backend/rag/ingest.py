import os
import httpx
from dotenv import load_dotenv
from rag.embeddings import embed_batch, chunk_text, clean_text
from rag.database import insert_chunks_batch, chunk_exists, get_chunk_count

load_dotenv()


async def ingest_spaceflight_news(limit: int = 50) -> dict:
    """
    Fetch recent space news from Spaceflight News API
    chunk, embed and store in Supabase.
    Free API — no key needed.
    """
    print(f"Starting Spaceflight News ingestion (limit={limit})")

    url = (
        "https://api.spaceflightnewsapi.net/v4/articles/"
        f"?limit={limit}&ordering=-published_at"
    )

    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()

    articles = data.get("results", [])
    chunks_added = 0
    chunks_failed = 0

    print(f"Fetched {len(articles)} articles")

    for article in articles:
        try:
            # skip if already ingested
            metadata = {
                "url": article.get("url", ""),
                "title": article.get("title", ""),
                "published_at": article.get("published_at", ""),
                "news_site": article.get("news_site", ""),
                "image_url": article.get("image_url", ""),
            }

            if await chunk_exists("spaceflight_news", metadata):
                print(f"Skipping (exists): {metadata['title'][:50]}")
                continue

            raw_text = f"{article.get('title', '')}\n\n" f"{article.get('summary', '')}"
            text = clean_text(raw_text)

            if len(text.split()) < 20:
                print(f"Skipping (too short): {metadata['title'][:50]}")
                continue

            # chunk text
            text_chunks = chunk_text(text, chunk_size=300, overlap=30)

            # embed all chunks at once
            embeddings = await embed_batch(text_chunks)

            # prepare rows for batch
            rows = [
                {
                    "content": chunk,
                    "embedding": embedding,
                    "source": "spaceflight_news",
                    "category": "news",
                    "metadata": {
                        **metadata,
                        "chunk_index": i,
                        "total_chunks": len(text_chunks),
                    },
                }
                for i, (chunk, embedding) in enumerate(zip(text_chunks, embeddings))
            ]

            added = await insert_chunks_batch(rows)
            chunks_added += added
            print(f"Added {added} chunks: {metadata['title'][:50]}")

        except Exception as e:
            chunks_failed += 1
            print(f"Failed: {e}")
            continue

    total = await get_chunk_count("spaceflight_news")
    print(f"Done. Added {chunks_added} chunks. Total: {total}")

    return {
        "source": "spaceflight_news",
        "articles": len(articles),
        "chunks_added": chunks_added,
        "chunks_failed": chunks_failed,
        "total_chunks": total,
    }


async def ingest_nasa_apod(limit: int = 30) -> dict:
    """
    Fetch NASA Astronomy Picture of the Day entries.
    Each entry has a title + explanation — rich space content.
    """
    print(f"Starting NASA APOD ingestion (limit={limit})")

    nasa_key = os.getenv("NASA_API_KEY", "DEMO_KEY")
    url = f"https://api.nasa.gov/planetary/apod" f"?api_key={nasa_key}&count={limit}"

    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=30)
        response.raise_for_status()
        articles = response.json()

    chunks_added = 0
    chunks_failed = 0

    print(f"Fetched {len(articles)} APOD entries")

    for article in articles:
        try:
            # skip videos — no useful text content
            if article.get("media_type") == "video":
                continue

            metadata = {
                "url": article.get("hdurl") or article.get("url", ""),
                "title": article.get("title", ""),
                "date": article.get("date", ""),
            }

            if await chunk_exists("nasa_apod", metadata):
                print(f"Skipping (exists): {metadata['title'][:50]}")
                continue

            raw_text = (
                f"{article.get('title', '')}\n\n" f"{article.get('explanation', '')}"
            )

            text = clean_text(raw_text)

            if len(text.split()) < 20:
                continue

            text_chunks = chunk_text(text, chunk_size=400, overlap=40)
            embeddings = await embed_batch(text_chunks)

            rows = [
                {
                    "content": chunk,
                    "embedding": embedding,
                    "source": "nasa_apod",
                    "category": "astronomy",
                    "metadata": {
                        **metadata,
                        "chunk_index": i,
                        "total_chunks": len(text_chunks),
                    },
                }
                for i, (chunk, embedding) in enumerate(zip(text_chunks, embeddings))
            ]

            added = await insert_chunks_batch(rows)
            chunks_added += added
            print(f"Added {added} chunks: {metadata['title'][:50]}")

        except Exception as e:
            chunks_failed += 1
            print(f"Failed: {e}")
            continue

    total = await get_chunk_count("nasa_apod")
    print(f"Done. Added {chunks_added} chunks. Total: {total}")

    return {
        "source": "nasa_apod",
        "articles": len(articles),
        "chunks_added": chunks_added,
        "chunks_failed": chunks_failed,
        "total_chunks": total,
    }


async def ingest_wikipedia(topics: list[str] | None = None) -> dict:
    """
    Fetch Wikipedia articles for space topics.
    Great for deep factual knowledge about satellites.
    """
    if topics is None:
        topics = [
            "International Space Station",
            "Hubble Space Telescope",
            "Tiangong space station",
            "NOAA-19",
            "Satellite",
            "Low Earth orbit",
            "Orbital mechanics",
            "Astronomical seeing",
            "Light pollution",
            "Bortle scale",
        ]

    print(f"Starting Wikipedia ingestion ({len(topics)} topics)")

    chunks_added = 0
    chunks_failed = 0

    async with httpx.AsyncClient() as client:
        for topic in topics:
            try:
                # Wikipedia REST API — no key needed
                url = (
                    "https://en.wikipedia.org/api/rest_v1"
                    f"/page/summary/{topic.replace(' ', '_')}"
                )

                response = await client.get(
                    url, timeout=15, headers={"User-Agent": "AstroWatch/1.0"}
                )

                if response.status_code == 404:
                    print(f"Not found: {topic}")
                    continue

                response.raise_for_status()
                data = response.json()

                metadata = {
                    "url": data.get("content_urls", {})
                    .get("desktop", {})
                    .get("page", ""),
                    "title": data.get("title", topic),
                    "date": "wikipedia",
                }

                if await chunk_exists("wikipedia", metadata):
                    print(f"Skipping (exists): {topic}")
                    continue

                # use extract (plain text summary)
                raw_text = f"{data.get('title', '')}\n\n" f"{data.get('extract', '')}"

                text = clean_text(raw_text)

                if len(text.split()) < 20:
                    continue

                text_chunks = chunk_text(
                    text,
                    chunk_size=400,
                    overlap=40,
                )
                embeddings = await embed_batch(text_chunks)

                rows = [
                    {
                        "content": chunk,
                        "embedding": embedding,
                        "source": "wikipedia",
                        "category": "satellite",
                        "metadata": {
                            **metadata,
                            "topic": topic,
                            "chunk_index": i,
                            "total_chunks": len(text_chunks),
                        },
                    }
                    for i, (chunk, embedding) in enumerate(zip(text_chunks, embeddings))
                ]

                added = await insert_chunks_batch(rows)
                chunks_added += added
                print(f"Added {added} chunks: {topic}")

            except Exception as e:
                chunks_failed += 1
                print(f"Failed {topic}: {e}")
                continue

    total = await get_chunk_count("wikipedia")
    print(f"Done. Added {chunks_added} chunks. Total: {total}")

    return {
        "source": "wikipedia",
        "topics": len(topics),
        "chunks_added": chunks_added,
        "chunks_failed": chunks_failed,
        "total_chunks": total,
    }
