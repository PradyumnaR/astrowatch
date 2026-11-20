import os

from uuid import UUID
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse
from fastmcp.utilities.lifespan import combine_lifespans
from redis.asyncio import Redis
from redis.exceptions import RedisError
from shared.redis_client import get_redis

from agents.models import (
    ChatHistoryResponse,
    ChatRequest,
    ChatResponse,
    ChatV2Request,
    ChatV2ResumeRequest,
    IngestRequest,
    IngestResponse,
    KnowledgeChunk,
    KnowledgeRequest,
    KnowledgeResponse,
)
from agents.chat_v2 import (
    get_chat_history,
    make_thread_id,
    stream_chat_with_tools_v2,
    stream_resume_v2,
)
from agents.knowledge import search_knowledge_base
from agents.chat import chat_with_tools
from agents.chat_v2 import get_chat_history, make_thread_id, stream_chat_with_tools_v2
from rag.ingest import (
    ingest_nasa_apod,
    ingest_spaceflight_news,
    ingest_wikipedia,
)
from rag.embeddings import embed_text
from mcp_servers.satellite_server import mcp as satellite_mcp
from mcp_servers.weather_server import mcp as weather_mcp
from mcp_servers.knowledge_server import mcp as knowledge_mcp
from mcp_servers.calendar_server import mcp as calendar_mcp

from auth import require_user
from shared.redis_client import redis_lifespan
from shared.http_client import http_lifespan
from shared.checkpointer import checkpointer_lifespan
from agents.graph.graph import graph_lifespan

from shared.rate_limit import chat_rate_limit

load_dotenv()

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # disables proxy buffering (Render/nginx), ensures chunks flush immediately
}

satellite_app = satellite_mcp.http_app(path="/")
weather_app = weather_mcp.http_app(path="/")
knowledge_app = knowledge_mcp.http_app(path="/")
calendar_app = calendar_mcp.http_app(path="/")

app = FastAPI(
    title="AstroWatch API",
    description="AI-powered satellite tracking backend",
    version="1.0.0",
    lifespan=combine_lifespans(
        redis_lifespan,
        http_lifespan,
        checkpointer_lifespan,
        graph_lifespan,
        satellite_app.lifespan,
        weather_app.lifespan,
        knowledge_app.lifespan,
        calendar_app.lifespan,
    ),
)

app.mount("/mcp/satellite", satellite_app)
app.mount("/mcp/weather", weather_app)
app.mount("/mcp/knowledge", knowledge_app)
app.mount("/mcp/calendar", calendar_app)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://astrowatch.vercel.app",  # ← add your Vercel URL
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


@app.get("health/redis")
async def health_redis(redis: Redis = Depends(get_redis)):
    try:
        redis.ping()
        redis_status = "ok"
    except RedisError as e:
        redis_status = f"error: {e}"
    return {
        "redis_status": "ok",
        "service": "Redis",
        "redis": redis_status,
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
                similarity=chunk.get("similarity"),
                rrf_score=chunk.get("rrf_score"),
                match_type=chunk.get("match_type"),
            )
            for chunk in chunks
        ],
    )


@app.post("/agents/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat with Claude using tools.

    POST /agents/chat
    body: {
      "messages":     [{"role": "user", "content": "..."}],
      "location":     { lat, lng, name, timezone },
      "selectedPass": { satid, satname, maxEl, ... }
    }
    """
    try:
        result = await chat_with_tools(
            messages=request.messages,
            location=request.location,
            selected_pass=request.selectedPass,
        )

        return ChatResponse(
            content=result["content"],
            toolsUsed=result["toolsUsed"],
            sources=[],
        )

    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@app.post("/agents/chat/v2/stream", dependencies=[Depends(chat_rate_limit)])
async def agents_chat_v2_stream(
    request: ChatV2Request,
    clerk_user_id: str = Depends(require_user),
):

    thread_id = make_thread_id(clerk_user_id, request.conversationId)
    return StreamingResponse(
        stream_chat_with_tools_v2(
            message=request.message,
            thread_id=thread_id,
            location=request.location,
            selected_pass=request.selectedPass,
            clerk_user_id=clerk_user_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disables proxy buffering (Render/nginx), ensures chunks flush immediately
        },
    )


@app.get("/agents/chat/v2/history", response_model=ChatHistoryResponse)
async def agents_chat_v2_history(
    conversationId: UUID,
    clerk_user_id: str = Depends(require_user),
):
    thread_id = make_thread_id(clerk_user_id, conversationId)
    messages, pending = await get_chat_history(thread_id)
    return ChatHistoryResponse(
        conversationId=conversationId,
        messages=messages,
        pendingConfirmation=pending,
    )


@app.post("/agents/chat/v2/resume", dependencies=[Depends(chat_rate_limit)])
async def agents_chat_v2_resume(
    request: ChatV2ResumeRequest,
    clerk_user_id: str = Depends(require_user),
):
    thread_id = make_thread_id(clerk_user_id, request.conversationId)

    # Resuming a thread that isn't paused would start the graph from
    # scratch with no input, so only allow it when a confirmation is pending
    _, pending = await get_chat_history(thread_id)
    if pending is None:
        raise HTTPException(
            status_code=409,
            detail="Nothing in this conversation is waiting for confirmation.",
        )

    return StreamingResponse(
        stream_resume_v2(thread_id, request.choice),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
