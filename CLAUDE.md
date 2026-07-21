# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What AstroWatch is

AstroWatch is an AI-powered satellite tracking + astronomy-planning app. A user picks a location, sees upcoming visible satellite passes scored for viewing quality, saves satellites/passes to watch, and chats with an AI assistant ("AstroWatch AI") that can fetch live pass data, weather, and a RAG knowledge base.

## Repository layout

A two-part monorepo with no shared tooling at the root:

- `frontend/` — Next.js 16 app (App Router, React 19, Tailwind v4, TypeScript). Also owns most of the product API surface via Route Handlers (`src/app/api/*`), Clerk auth, and direct server-side Supabase access. Run all `npm`/`next` commands from inside this directory.
- `backend/` — FastAPI service (Python 3.13) hosting the Anthropic agent and the RAG pipeline (Voyage embeddings + Supabase pgvector), served by Uvicorn. Run all Python commands from inside this directory.

Deployment: frontend on Vercel, backend on Render (`backend/render.yaml`).

## Frontend

Commands (run from `frontend/`):

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)

Conventions:

- `@/*` path alias maps to `frontend/src/*`.
- **Auth is Clerk.** `src/proxy.ts` is the Clerk middleware and protects every route except `/sign-in` and `/sign-up`. Route Handlers gate on `auth()` from `@clerk/nextjs/server`.
- **Global client state is Zustand** in `src/stores/astrowatch.ts` (location, passes, selected pass, weather, saved satellites/passes, `passCache`, user plan).
- **Route Handlers act as a BFF.** They proxy external APIs and talk to Supabase with the service key server-side (never expose the service key to the browser). Key routes: `chat/v2` (proxies the FastAPI agent — this is the active chat path), `passes` (N2YO), `weather` (Open-Meteo), `satellites/search` (Celestrak + Supabase catalog cache), `saved-satellites`, `watched-passes`, `users/{sync,me}`. `chat/route.ts` (v1) is a legacy direct-Anthropic streaming path via the Vercel AI SDK and is **not** wired into the UI.
- **Viewing score** is computed client-side (`lib/viewing-score.ts` + `lib/getWeatherAtHour.ts`): elevation 40%, cloud 30%, satellite brightness 10%, moon 10%, dark-sky/Bortle 10%.
- Testing conventions live in `frontend/CLAUDE.md` (Vitest + Playwright). No tests exist yet — add them when introducing testable logic.

**Next.js version warning:** This is Next.js 16, which has breaking changes vs. older versions — APIs, conventions, and file structure may differ from training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next.js code, and heed deprecation notices. (Route Handler dynamic params are now async: `{ params }: { params: Promise<{ id: string }> }`.)

## Backend

Setup and run (run from `backend/`):

- `python -m venv venv && source venv/bin/activate` — create/activate the venv (`./start-venv.sh` just sources it; note the dir is `venv/`, not `.venv/`)
- `pip install -r requirements.txt` — install dependencies
- `uvicorn main:app --reload` — run the FastAPI app (entrypoint is `main.py`; `./start-server.sh` and `render.yaml` use `uvicorn main:app`)

Architecture:

- **FastAPI app** (`main.py`) exposes: `/health`, `/agents/chat` (main agent endpoint), `/agents/knowledge` (RAG search), `/ingest` + `/ingest/status` (operational RAG ingestion), and a couple of `/test/*` diagnostics. Only `/agents/chat` and `/agents/knowledge` are called from the frontend.
- **AI agent** (`agents/chat.py`) is a **hand-rolled tool loop over the raw `anthropic` SDK** — NOT LangChain/LangGraph. Model `claude-sonnet-4-6`, `MAX_ITERATIONS = 5`; on `stop_reason == "tool_use"` it runs all tool calls in parallel via `asyncio.gather`, feeds results back, and loops until `end_turn`.
- **Tools** (`tools/`): `get_satellite_passes` (N2YO), `get_weather` (Open-Meteo), `search_knowledge` (RAG). Tool schemas are Anthropic `ToolParam`s built from Pydantic models in `tools/tools_list.py`; `tools/execute_tools.py` validates input and dispatches.
- **RAG** (`rag/`): `embeddings.py` (Voyage `voyage-3`, 1024-dim), `search.py` (embed query → pgvector), `database.py` (Supabase client + `knowledge_chunks` CRUD and the `match_knowledge` RPC), `ingest.py` (Spaceflight News / NASA APOD / Wikipedia).
- **Pydantic models** are in `agents/models.py` (`Location`, `SatellitePass`, `ChatMessage`, request/response types). Note the tool-input models are currently duplicated across `agents/models.py`, `tools/tools_list.py`, and `tools/execute_tools.py` — keep them in sync if you touch tool signatures.

When building AI features, default to the latest Claude models (see the Anthropic API reference / `claude-api` skill).

> Historical note: earlier scaffolding intended `langchain`/`langgraph`/`mcp` and `sgp4` orbit propagation. None of that is present — the agent uses the `anthropic` SDK directly and pass prediction is delegated to the N2YO API. Don't reintroduce those deps unless a task explicitly calls for them.

## Supabase (shared persistence)

Supabase is the integration point between the two halves; schema/auth changes affect both. There are no migration files in the repo — schema is defined in the hosted project. Tables in use:

- `knowledge_chunks` — RAG store: `content`, `embedding vector(1024)`, `source` (`spaceflight_news`|`nasa_apod`|`wikipedia`), `category`, `metadata jsonb`. Queried via the `match_knowledge(query_embedding, match_threshold, match_count, filter_source)` RPC.
- `users` — Clerk-synced profile: `clerk_user_id`, `email`, name fields, `plan` (`standard`|`pro`, default `standard`), `login_count`, `last_login_at`.
- `saved_satellites` — `clerk_user_id`, `norad_id`, `sat_name`, `saved_at`.
- `watched_passes` — `clerk_user_id`, `norad_id`, `sat_name`, `start_utc`, `pass_data jsonb` (full enriched pass), `saved_at`.
- `satellite_catalog_cache` — `category` (PK), `satellites jsonb`, `fetched_at` (2h freshness; falls back to stale cache on Celestrak 403).

Plan limits (`standard` = 5 saved sats / 5 watched passes, `pro` = unlimited) are enforced both client-side (`lib/plans.ts`, `consts/`) and server-side (`lib/server/*`, returning 403 `limit_reached`).

## Environment variables

- **Backend:** `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `N2YO_API_KEY`, `NASA_API_KEY` (defaults to `DEMO_KEY`), `FRONTEND_URL` (added to CORS allow-list).
- **Frontend:** `NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:8000`), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `N2YO_API_KEY`, `ANTHROPIC_API_KEY` (legacy v1 route only), plus Clerk keys.
