from pydantic import BaseModel
from typing import Annotated, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, StringConstraints

# Upper bound on one chat message. Protects LLM cost and the stored
# history from oversized input; ~4000 chars is far beyond a real question.
MAX_MESSAGE_CHARS = 4000

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
    rrf_score: Optional[float] = None  # new — hybrid mode only
    match_type: Optional[str] = None  # new — "semantic" | "keyword" | "both"


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


class ChatV2Request(BaseModel):
    """v2 chat: the server owns the conversation history (LangGraph
    checkpointer), so the client sends only the new message plus the
    conversation it belongs to."""

    message: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=MAX_MESSAGE_CHARS
        ),
    ]
    conversationId: UUID
    location: Optional[Location] = None
    selectedPass: Optional[SatellitePass] = None


class ConfirmationOption(BaseModel):
    label: str
    value: str


class PendingConfirmation(BaseModel):
    """A question the graph is paused on (the interrupt() payload)."""

    kind: Literal["create", "delete", "update"]
    question: str
    options: list[ConfirmationOption]


class ChatV2ResumeRequest(BaseModel):
    """The user's answer to a pending confirmation."""

    conversationId: UUID
    choice: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class ChatHistoryResponse(BaseModel):
    conversationId: UUID
    messages: list[ChatMessage]
    # Set when the conversation is paused on a calendar confirmation,
    # so a reloaded page can show the card again
    pendingConfirmation: Optional[PendingConfirmation] = None
