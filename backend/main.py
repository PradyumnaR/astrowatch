from unittest import result
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from agents.models import (
    ChatRequest,
    IngestRequest,
    IngestResponse,
    KnowledgeChunk,
    KnowledgeRequest,
    KnowledgeResponse,
)
from agents.knowledge import search_knowledge_base
from rag.ingest import (
    ingest_nasa_apod,
    ingest_spaceflight_news,
    ingest_wikipedia,
)
from rag.embeddings import embed_text

load_dotenv()

app = FastAPI(
    title="AstroWatch API",
    description="AI-powered satellite tracking backend",
    version="1.0.0",
)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "AstroWatch API",
        "version": "1.0.0",
    }


@app.post("/test/models")
async def test_models(request: ChatRequest):
    return {
        "message_count": len(request.messages),
        "has_location": request.location is not None,
        "hass_pass": request.selectedPass is not None,
    }


@app.get("/test/embeddings")
async def test_embeddings():
    text = "The ISS orbits Earth at 408km altitude"
    vector = await embed_text(text)

    return {
        "text": text,
        "dimensions": len(vector),
        "sample": vector[:5],
    }


@app.post("/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest):
    """
    Trigger ingestion for a data source.
    POST /ingest
    body: { "source": "spaceflight_news", "limit": 50 }
    """

    if request.source == "spaceflight_news":
        result = await ingest_spaceflight_news(request.limit)

    elif request.source == "nasa_apod":
        result = await ingest_nasa_apod(request.limit)

    elif request.source == "wikipedia":
        result = await ingest_wikipedia()

    else:
        return IngestResponse(
            source=request.source,
            chunks_added=0,
            chunks_failed=0,
            message=f"Unknown source: {request.source}",
        )
    return IngestResponse(
        source=result["source"],
        chunks_added=result["chunks_added"],
        chunks_failed=result["chunks_failed"],
        message=(
            f"Successfully ingested {result['chunks_added']} "
            f"chunks from {result['source']}"
        ),
    )


@app.get("/ingest/status")
async def ingest_status():
    """
    Check how many chunks exist per source.
    """
    from rag.database import get_chunk_count

    return {
        "spaceflight_news": await get_chunk_count("spaceflight_news"),
        "nasa_apod": await get_chunk_count("nasa_apod"),
        "wikipedia": await get_chunk_count("wikipedia"),
        "total": await get_chunk_count(),
    }


@app.post("/agents/knowledge", response_model=KnowledgeResponse)
async def knowledge_agent(request: KnowledgeRequest):
    """
    Search knowledge base for relevant chunks.

    POST /agents/knowledge
    body: {
      "query":    "tell me about ISS",
      "limit":    3,
      "norad_id": 25544
    }
    """

    chunks = await search_knowledge_base(
        query=request.query, limit=request.limit, norad_id=request.norad_id
    )

    return KnowledgeResponse(
        query=request.query,
        chunks=[
            KnowledgeChunk(
                id=str(chunk.get("id", "")),
                content=chunk.get("content", ""),
                source=chunk.get("source", ""),
                category=chunk.get("category", ""),
                metadata=chunk.get("metadata", {}),
                similarity=chunk.get("similarity", 0.0),
            )
            for chunk in chunks
        ],
    )
