# AstroWatch — Technical Context Summary

AstroWatch is an AI-powered satellite tracking + astronomy-planning app. A user
picks a location, sees upcoming visible satellite passes scored for viewing
quality, saves satellites/passes to watch, and chats with an AI assistant
("AstroWatch AI") that can fetch live pass data, weather, and a RAG knowledge
base.

It is a two-part monorepo (no shared root tooling):

- **`frontend/`** — Next.js 16 (App Router, React 19, Tailwind v4, TS). Also owns
  most of the product API surface via Route Handlers, plus Clerk auth and direct
  Supabase access.
- **`backend/`** — FastAPI (Python 3.13) service hosting the Anthropic agent +
  RAG (Voyage embeddings + Supabase pgvector). Deployed on Render; frontend on
  Vercel.

> Note: The repo is substantially more built out than the top-level `CLAUDE.md`
> scaffolding notes suggest (those say the backend has "no application source"
> and the frontend is the create-next-app starter — both are stale). There is
> **no LangChain/LangGraph code** despite it being listed as intended
> architecture, and **no `state.py`**. The agent is a hand-rolled tool loop.

---

## 1) Directory tree (source only; venv / node_modules / build output omitted)

```
astrowatch/
├── CLAUDE.md
├── README.md
├── pyrightconfig.json
├── .vscode/settings.json
│
├── backend/                         # FastAPI service (Python 3.13)
│   ├── main.py                      # FastAPI app + all routes
│   ├── requirements.txt
│   ├── render.yaml                  # Render deploy config
│   ├── runtime.txt
│   ├── ruff.toml
│   ├── start-server.sh
│   ├── start-venv.sh
│   ├── .gitignore
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── chat.py                  # Anthropic agentic tool loop
│   │   ├── knowledge.py             # knowledge-base search + chunk formatting
│   │   └── models.py                # Pydantic request/response + tool schemas
│   ├── rag/
│   │   ├── __init__.py
│   │   ├── database.py              # Supabase client + knowledge_chunks CRUD/search  ← open in IDE
│   │   ├── embeddings.py            # Voyage embeddings + chunk/clean helpers
│   │   ├── search.py                # embed query → pgvector search
│   │   └── ingest.py                # Spaceflight News / NASA APOD / Wikipedia ingestion
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── tools_list.py            # Anthropic TOOLS (ToolParam) definitions
│   │   ├── execute_tools.py         # dispatch + Pydantic validation per tool
│   │   ├── passes.py                # N2YO visual passes
│   │   ├── weather.py               # Open-Meteo current conditions
│   │   └── knowledge.py             # wraps agents.knowledge for tool use
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── build_system_prompt.py   # system prompt w/ location + selected pass
│   │   └── location.py              # human-readable lat/lng formatting
│   └── scripts/
│       ├── __init__.py
│       ├── ingest_apod.py
│       ├── ingest_spaceflight.py
│       └── ingest_wikipedia.py
│
└── frontend/                        # Next.js 16 app
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json
    ├── eslint.config.mjs
    ├── postcss.config.mjs
    ├── components.json              # shadcn config
    ├── CLAUDE.md / AGENTS.md        # testing conventions + Next 16 warning
    ├── supabase/                    # Supabase CLI state
    └── src/
        ├── proxy.ts                 # Clerk middleware (route protection)
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx
        │   ├── globals.css
        │   ├── sign-in/[[...sign-in]]/page.tsx
        │   ├── sign-up/[[...sign-up]]/page.tsx
        │   ├── api/                 # Route Handlers (product BFF)
        │   │   ├── chat/route.ts            # v1: direct Anthropic streaming (Vercel AI SDK)
        │   │   ├── chat/v2/route.ts         # v2: proxy to FastAPI /agents/chat  (ACTIVE)
        │   │   ├── passes/route.ts          # N2YO proxy (cached 1h)
        │   │   ├── weather/route.ts         # Open-Meteo hourly proxy
        │   │   ├── satellites/search/route.ts   # Celestrak catalog + Supabase cache
        │   │   ├── saved-satellites/route.ts        # GET / POST
        │   │   ├── saved-satellites/[id]/route.ts   # DELETE (by norad_id)
        │   │   ├── watched-passes/route.ts          # GET / POST
        │   │   ├── watched-passes/[id]/route.ts     # DELETE
        │   │   ├── watched-passes/satellite/[id]/route.ts  # DELETE all for a sat
        │   │   ├── users/sync/route.ts      # upsert user on login
        │   │   └── users/me/route.ts        # get plan/email/etc.
        │   └── dashboard/
        │       ├── layout.tsx  (NavBar)
        │       ├── page.tsx
        │       ├── _components/ NavBar.tsx, NavLink.tsx
        │       ├── sky-planner/
        │       │   ├── page.tsx
        │       │   └── _components/  ChatPanel, RagPanel, WeatherPanel, WeatherSkeleton,
        │       │       PassList, PassItem, SkyCanvas, SkyCanvas-v2, LocationDetector,
        │       │       MessageBubble, Markdown, ConditionRow, ViewingScore
        │       └── my-satellites/
        │           ├── page.tsx
        │           └── _components/  SidebarTabs, BrowseTab, MySatellitesTab,
        │               PassesTable, WeeklyHighlights
        ├── components/  AppInitializer, LoadingSkeleton, ProgressBar, ScoreBadge,
        │                ui/UpgradeModal, ui/table
        ├── consts/index.ts          # SAT_COLORS, DEFAULT_LOCATION, PLAN_LIMITS, UserMessages
        ├── hooks/useSavedSatellites.ts
        ├── lib/                     # formatters, geocode, moon, viewing-score, plans, server/*
        │   └── server/  supabase.ts, user.ts, satellites.ts, passes.ts
        ├── stores/astrowatch.ts     # Zustand global store
        └── types/index.ts
```

---

## 2) `backend/agents/chat.py` and `state.py`

**There is no `state.py`** (no LangGraph state machine). The agent is a manual
tool loop in `agents/chat.py`.

### `backend/agents/chat.py` (verbatim behavior)

- Uses the raw `anthropic` SDK (`anthropic.Anthropic`), **not** LangChain.
- `MODEL = "claude-sonnet-4-6"`, `MAX_ITERATIONS = 5`, `max_tokens=2048`.
- `chat_with_tools(messages, location=None, selected_pass=None) -> dict`:
  1. Builds a system prompt via `build_system_prompt(location, selected_pass)`.
  2. Converts `list[ChatMessage]` → Anthropic `MessageParam` list.
  3. Loops up to `MAX_ITERATIONS`:
     - Calls `client.messages.create(model, max_tokens, system, tools=TOOLS, messages)`.
     - If `stop_reason == "end_turn"` → extracts first `TextBlock` and returns
       `{"content": ..., "toolsUsed": [...]}`.
     - If `stop_reason == "tool_use"` → appends the assistant block list, extracts
       `ToolUseBlock`s, **executes all tool calls in parallel** with
       `asyncio.gather(execute_tool(...))`, appends `ToolResultBlockParam`s as a
       user message, and continues.
     - Any other stop reason → break.
  4. On max iterations → returns a graceful "needed more time" message.
- `norad_id` for tool calls is taken from `selected_pass.satid` when present.
- Note: `client.messages.create` is a **synchronous** call invoked inside an async
  function (not awaited / not offloaded to a thread).

---

## 3) FastAPI route structure (`backend/main.py`)

App: `FastAPI(title="AstroWatch API", version="1.0.0")`.
CORS allow-list: `http://localhost:3000`, `https://astrowatch.vercel.app`, and
`os.getenv("FRONTEND_URL")`; credentials + all methods/headers allowed.

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/health` | Liveness `{status, service, version}` |
| POST | `/test/models` | Echo request shape (message count, has_location, has_pass) |
| GET  | `/test/embeddings` | Sanity-check Voyage embeddings (returns dims + sample) |
| POST | `/ingest` | Trigger ingestion; body `{source, limit}`; source ∈ `spaceflight_news`\|`nasa_apod`\|`wikipedia`; returns `IngestResponse` |
| GET  | `/ingest/status` | Chunk counts per source + total |
| POST | `/agents/knowledge` | RAG search; body `KnowledgeRequest`; returns `KnowledgeResponse` (chunks) |
| POST | `/agents/chat` | **Main agent endpoint**; body `ChatRequest`; runs `chat_with_tools`; returns `ChatResponse`. Wrapped in try/except → HTTP 500 on failure |

The **frontend only calls two of these directly**: `/agents/chat` (via
`/api/chat/v2` proxy) and `/agents/knowledge` (from `RagPanel`, direct to
`NEXT_PUBLIC_BACKEND_URL`). Ingestion endpoints are operational/manual.

**Deploy (`render.yaml`):** Python web service, Python 3.13.5,
`startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT`.

---

## 4) Supabase schema / tables used

There are **no migration files in the repo** — schema is inferred from usage.
Two clients: backend uses `SUPABASE_SERVICE_KEY` (service role, bypasses RLS);
frontend Route Handlers also use `SUPABASE_SERVICE_KEY` server-side (never
exposed to the browser). Frontend uses `NEXT_PUBLIC_SUPABASE_URL`; backend uses
`SUPABASE_URL`.

### `knowledge_chunks` (RAG store — backend `rag/database.py`)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid/serial | PK |
| `content` | text | chunk text |
| `embedding` | vector(1024) | pgvector; Voyage `voyage-3`, 1024 dims |
| `source` | text | `spaceflight_news` \| `nasa_apod` \| `wikipedia` |
| `category` | text | `news` \| `astronomy` \| `satellite` |
| `metadata` | jsonb | `{url, title, published_at?, news_site?, image_url?, date?, topic?, chunk_index, total_chunks}` |

- Dedup check queries `metadata->>url`.
- **RPC function `match_knowledge(query_embedding, match_threshold, match_count,
  filter_source)`** — pgvector similarity search returning rows + `similarity`.
  Defaults: `match_threshold=0.5` in DB layer, but `search.py` calls with `0.45`.

### `users` (Clerk-synced profile + plan)
Columns used: `id`, `clerk_user_id`, `email`, `first_name`, `last_name`,
`plan` (`'standard'|'pro'`, default standard), `login_count`, `last_login_at`.
Written by `/api/users/sync` (upsert on login, increments `login_count`), read by
`/api/users/me` and `lib/server/user.ts`.

### `saved_satellites`
Columns: `id`, `clerk_user_id`, `norad_id`, `sat_name`, `saved_at`.
Queried by `clerk_user_id`; ordered by `saved_at`. Snake↔camel mapping in routes.

### `watched_passes`
Columns: `id`, `clerk_user_id`, `norad_id`, `sat_name`, `start_utc` (unix secs),
`pass_data` (jsonb — full enriched `SatellitePass`), `saved_at`.
GET filters to future passes (`start_utc > now`).

### `satellite_catalog_cache`
Columns: `category` (PK / upsert `onConflict`), `satellites` (jsonb array of
`{noradId, satname, category}`), `fetched_at` (timestamptz).
Caches Celestrak GP results for 2h; falls back to stale cache if Celestrak 403s.

---

## 5) Pydantic models (`backend/agents/models.py` + tool schemas)

**Domain / request-response models (`agents/models.py`):**
- `Location`: `lat, lng, name, timezone="UTC"`
- `SatellitePass`: `satid, satname, startAz, startAzCompass, startEl, startUTC,
  maxAz, maxEl, maxUTC, endAz, endUTC, mag, duration` + optional enrichment
  `viewingScore, cloudCover, temperature, windSpeed, moonPhase, moonIllumination`
- `ChatMessage`: `role, content`
- `ChatRequest`: `messages: list[ChatMessage]`, `location?`, `selectedPass?`
- `ChatResponse`: `content`, `sources: list[str]=[]`, `toolsUsed: list[str]=[]`
- `KnowledgeRequest`: `query`, `limit=3`, `norad_id?`
- `KnowledgeChunk`: `id, content, source, category?, metadata={}, similarity?`
- `KnowledgeResponse`: `chunks, query`
- `IngestRequest`: `source, limit=50` / `IngestResponse`: `source, chunks_added,
  chunks_failed, message`
- Also (unused duplicates) `PassesToolInput`, `WeatherToolInput`, `KnowledgeToolInput`.

**Tool input schemas — the ones actually used for Claude tools live in
`tools/tools_list.py`** (with `Field(description=...)`), and are **duplicated**
again in `tools/execute_tools.py` for validation:
- `PassesInput`: `norad_id, lat, lng, days=3`
- `WeatherInput`: `lat, lng`
- `KnowledgeInput`: `query, norad_id?, limit=3`

`make_tool(name, description, model)` turns each into an Anthropic `ToolParam`
via `model.model_json_schema()`. Three tools registered in `TOOLS`:
`get_satellite_passes`, `get_weather`, `search_knowledge`.

**Tool execution flow (`execute_tools.py`):** dispatch by name → validate input
with the local Pydantic model → call the concrete tool (`passes.py`,
`weather.py`, `tools/knowledge.py`) → return a JSON string (passes/weather) or a
pre-formatted knowledge string. `search_knowledge` falls back to the
`selected_pass` NORAD id when the tool didn't supply one. Errors are caught and
returned as `"Tool X failed: ..."` strings.

**External APIs used by tools:**
- Passes → N2YO `visualpasses` (`N2YO_API_KEY`), returns top 5 passes.
- Weather → Open-Meteo `current` (cloud_cover, temp °F, wind mph).
- Knowledge → Voyage embed + Supabase `match_knowledge` RPC.

---

## 6) Key frontend components — Sky Planner & My Satellites, and how they call the backend

### Global state — `stores/astrowatch.ts` (Zustand)
Single store holding: `location` + `locationStatus` (+ `fetchLocation()` using
`navigator.geolocation` → `reverseGeocode`, falling back to `DEFAULT_LOCATION`
Burbank CA), `passes`/`selectedPass`, `weather` (display) + `weatherOm`
(raw Open-Meteo hourly), `savedSatellites`, `savedPasses`, `passCache`
(per-NORAD, avoids repeat N2YO calls), and `userPlan`.

### Sky Planner (`app/dashboard/sky-planner/`)
`page.tsx` is a 3-column grid: **left** `LocationDetector` + `PassList`;
**center** `SkyCanvas-v2` + `ChatPanel`; **right** `WeatherPanel` + `RagPanel`.

- **`PassList.tsx`** — Two tabs ("Default Passes" / "My passes").
  - Default: once `location` and `weatherOm.hourly` exist, fetches passes for 3
    hardcoded sats (ISS 25544, Tiangong 48274, Hubble 20580) in parallel via
    `GET /api/passes?id=&lat=&lng=&days=1`, enriches each with
    `getWeatherAtHour(...)` (cloud/temp/wind/moon + `viewingScore`), sorts by
    score desc, auto-selects the best, and pushes display values into
    `setWeather`.
  - My passes: `GET /api/watched-passes` and renders `p.passData`.
  - Clicking a `PassItem` sets `selectedPass` and updates the WeatherPanel.

- **`ChatPanel.tsx`** — Local `useState` message list (the Vercel AI SDK
  `useChat`/streaming path is commented out). On submit:
  `POST /api/chat/v2` with `{messages:[{role,content}], location, selectedPass}`;
  renders returned `content` + `toolsUsed` chips. (So the **active chat path goes
  through the FastAPI agent**, not the direct-Anthropic v1 route.)

- **`RagPanel.tsx`** — On `selectedPass` change, calls the **backend directly**:
  `POST ${NEXT_PUBLIC_BACKEND_URL}/agents/knowledge` with
  `{query: satname, limit: 3, norad_id}`. Splits chunks into a description card
  (wikipedia/nasa_apod) + recent-news list (spaceflight_news).

- **`WeatherPanel.tsx`** — reads `weather` from the store (no direct fetch).
- **`LocationDetector.tsx`** — triggers `fetchLocation()`.
- **`SkyCanvas` / `SkyCanvas-v2`** — sky/az-el visualization of the selected pass
  (page uses the `-v2` version).

### My Satellites (`app/dashboard/my-satellites/`)
`page.tsx` grid: **left** `SidebarTabs` (Browse / My Satellites), **center**
`PassesTable`, **right** `WeeklyHighlights`. On mount it fetches
`GET /api/saved-satellites` into the store.

- **`BrowseTab.tsx`** — category chips (stations/weather/science/gps/starlink/
  amateur) + debounced (400ms) search. `GET /api/satellites/search?category=&q=`
  (Celestrak via cached Route Handler). Save → `useSavedSatellites().handleSaveSat`;
  enforces `PLAN_LIMITS` client-side and shows `UpgradeModal` on limit / 403.

- **`MySatellitesTab.tsx`** — lists saved sats with color dots (`SAT_COLORS`);
  remove → `handleRemoveSat`.

- **`PassesTable.tsx`** — sortable table (satellite/date/score/elevation) of
  `savedPasses` (future only). Per row: **Email** (opens `mailto:` with pass
  details) and **Watch** (`POST /api/watched-passes`, tracks `watchedKeys`,
  handles 403 → `UpgradeModal`). Loads current watched keys via
  `GET /api/watched-passes`.

- **`WeeklyHighlights.tsx`** — pure client aggregation of `savedPasses`:
  best pass per satellite + per-satellite pass-count breakdown bars.

- **`hooks/useSavedSatellites.ts`** — orchestration hook:
  `fetchWeather` (`GET /api/weather`), `fetchSavedSats` (`GET /api/saved-satellites`),
  `handleSaveSat` (`POST /api/saved-satellites`, then fetch that sat's 7-day
  passes via `GET /api/passes?...&days=7`, enrich with `getWeatherAtHour`, store
  in `passCache` + `savedPasses`), `handleRemoveSat` (parallel DELETE of
  `/api/saved-satellites/:noradId` + `/api/watched-passes/satellite/:noradId`).

### Viewing score & weather enrichment (client-side)
- `lib/viewing-score.ts::computeScore(maxEl, cloud=20, moon=0.3, bortle=5, mag)`
  → 0–10 weighted: elevation 40%, (100−cloud) 30%, brightness 10%
  (mag clamped −4..6), (1−moon) 10%, darkness `(9−bortle)/8` 10%.
- `lib/getWeatherAtHour.ts` matches a pass's start hour to the Open-Meteo hourly
  array, computes moon phase (`lib/moon.ts`), and calls `computeScore`.

### Request-flow map (who calls what)
```
Browser
 ├─ /api/chat/v2 ───────────────► FastAPI /agents/chat ─► Anthropic + tools
 │                                      (N2YO, Open-Meteo, Voyage+Supabase RAG)
 ├─ ${BACKEND_URL}/agents/knowledge ──► FastAPI RAG (RagPanel, direct)
 ├─ /api/passes ────────────────► N2YO (cached 1h)
 ├─ /api/weather ───────────────► Open-Meteo (hourly, 3 days)
 ├─ /api/satellites/search ─────► Celestrak GP + Supabase catalog cache
 ├─ /api/saved-satellites[/:id] ► Supabase saved_satellites
 ├─ /api/watched-passes[...] ───► Supabase watched_passes
 └─ /api/users/{sync,me} ───────► Clerk + Supabase users
```
Two chat backends exist: `/api/chat` (v1) streams straight from Anthropic via the
Vercel AI SDK (`@ai-sdk/anthropic`, `claude-sonnet-4-6`) with no tools; `/api/chat/v2`
proxies to the tool-enabled FastAPI agent and is the one the UI uses.

---

## 7) LangChain / LangGraph code

**None present.** Although `langchain`, `langgraph`, `langgraph-checkpoint`, and
`mcp` are named as the intended architecture in `CLAUDE.md`, they do **not appear
in `backend/requirements.txt`** and there is no import of them anywhere in the
source. The agent loop is implemented directly against the `anthropic` SDK
(`anthropic==0.34.0`) with a hand-written tool-dispatch loop (`agents/chat.py` +
`tools/execute_tools.py`). There is also no `sgp4`/orbit-propagation code — pass
prediction is delegated to the N2YO API.

### Backend stack (`requirements.txt`)
`fastapi>=0.115`, `uvicorn==0.30.6`, `anthropic==0.34.0`, `voyageai==0.4.1`,
`supabase==2.7.4`, `httpx==0.27.2`, `pydantic>=2.10`, `python-dotenv`, `black`.

### Frontend stack (`package.json`)
`next@16.2.9`, `react@19.2.4`, `@clerk/nextjs@^7.5`, `@supabase/supabase-js`,
`ai@^6` + `@ai-sdk/anthropic` + `@ai-sdk/react`, `@anthropic-ai/sdk`,
`zustand@^5`, `react-markdown`+`remark-gfm`, `radix-ui`/`shadcn`, Tailwind v4,
`@types/maplibre-gl`. Auth is Clerk (`src/proxy.ts` middleware protects
everything except `/sign-in`, `/sign-up`).

---

## Environment variables (observed)

**Backend:** `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `N2YO_API_KEY`, `NASA_API_KEY` (defaults `DEMO_KEY`),
`FRONTEND_URL`.
**Frontend:** `ANTHROPIC_API_KEY` (v1 route), `NEXT_PUBLIC_BACKEND_URL`
(default `http://localhost:8000`), `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `N2YO_API_KEY`, plus Clerk keys.

## Notable observations / rough edges
- Tool input Pydantic models are defined **three times** (`agents/models.py`,
  `tools/tools_list.py`, `tools/execute_tools.py`).
- `rag/database.py` has stray unused imports (`from unittest import result`,
  `import supabase`) — the IDE-open file.
- `chat.py` uses a **sync** Anthropic client call inside async code.
- Plan limits are enforced both client-side (`lib/plans.ts` + `consts`) and
  server-side (`lib/server/*` returning 403 `limit_reached`); "pro" is `Infinity`
  and the UI copy says Pro is "coming soon."
- No test files exist yet despite `frontend/CLAUDE.md` documenting a
  Vitest/Playwright convention (`src/__tests__/`, `e2e/`).
```
