from pydantic import BaseModel
from typing import Optional

# ── Location ─────────────────────────────────────────


class Location(BaseModel):
    lat: float
    lng: float
    name: str
    timezone: str = "UTC"


# ── Satellite Pass ────────────────────────────────────


class SatellitePass(BaseModel):
    satid: int
    satname: str
    startAz: float
    startAzCompass: str
    startEl: float
    startUTC: int
    maxAz: float
    maxEl: float
    maxUTC: int
    endAz: float
    endUTC: int
    mag: float
    duration: float
    viewingScore: Optional[float] = None
    cloudCover: Optional[float] = None
    temperature: Optional[float] = None
    windSpeed: Optional[float] = None
    moonPhase: Optional[str] = None
    moonIllumination: Optional[float] = None


# ── Chat ──────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    location: Optional[Location] = None
    selectedPass: Optional[SatellitePass] = None


class ChatResponse(BaseModel):
    content: str
    sources: list[str] = []
    toolsUsed: list[str] = []


# ── Knowledge ─────────────────────────────────────────
class KnowledgeRequest(BaseModel):
    query: str
    limit: int = 3
    norad_id: Optional[int] = None


class KnowledgeChunk(BaseModel):
    id: str
    content: str
    source: str
    category: Optional[str] = None
    metadata: dict = {}
    similarity: Optional[float] = None


class KnowledgeResponse(BaseModel):
    chunks: list[KnowledgeChunk]
    query: str


# ── Ingestion ─────────────────────────────────────────
class IngestRequest(BaseModel):
    source: str  # "spaceflight_news" "nasa_apod" "wikipedia"
    limit: int = 50


class IngestResponse(BaseModel):
    source: str
    chunks_added: int
    chunks_failed: int
    message: str


# ── Tool definitions (used by Claude) ─────────────────


class PassesToolInput(BaseModel):
    norad_id: int
    lat: float
    lng: float
    days: int = 7


class WeatherToolInput(BaseModel):
    lat: float
    lng: float


class KnowledgeToolInput(BaseModel):
    query: str
    limit: int = 3
