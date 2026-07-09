from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from agents.models import ChatRequest
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
