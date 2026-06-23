# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

AstroWatch is a two-part monorepo with no shared tooling at the root:

- `frontend/` — Next.js 16 app (App Router, React 19, Tailwind v4, TypeScript). Run all `npm`/`next` commands from inside this directory.
- `backend/` — Python service (FastAPI + LangChain/LangGraph + Anthropic, served by Uvicorn). Run all Python commands from inside this directory.

Both halves are early-stage scaffolding: the frontend is the unmodified `create-next-app` starter (`src/app/page.tsx` is still the template), and the backend currently contains **no application source** — only `requirements.txt` and a virtualenv. Expect to be creating structure rather than fitting into it.

## Frontend

Commands (run from `frontend/`):

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)

Conventions:

- `@/*` path alias maps to `frontend/src/*`.
- Supabase is a dependency here (the `supabase` CLI is a devDependency and `frontend/supabase/` holds CLI state), so the frontend talks to Supabase directly in addition to the backend.

**Next.js version warning (from `frontend/AGENTS.md`):** This is Next.js 16, which has breaking changes vs. older versions — APIs, conventions, and file structure may differ from training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next.js code, and heed deprecation notices. `frontend/CLAUDE.md` simply re-includes `AGENTS.md`.

## Backend

Setup and run (run from `backend/`):

- `python -m venv .venv && source .venv/bin/activate` — create/activate the venv (`./start-venv.sh` just sources it)
- `pip install -r requirements.txt` — install dependencies
- `uvicorn <module>:app --reload` — run the FastAPI app once an entrypoint exists (no module is defined yet)

The dependency set reveals the intended architecture even though code isn't written:

- **Satellite tracking** — `sgp4` propagates orbits from TLE data; combined with the frontend's `maplibre-gl` typings, the app plots satellite positions on a map. This is the core domain.
- **AI agent layer** — `langchain` / `langgraph` / `langgraph-checkpoint` orchestrate an `anthropic`-backed agent, with `mcp` for Model Context Protocol tool integration.
- **Shared persistence** — `supabase` (with `realtime`, `postgrest`, `supabase-auth`) is the database/auth layer shared between frontend and backend.

When building AI features, default to the latest Claude models (see the Anthropic API reference / `claude-api` skill).

## Cross-cutting

- Supabase is the integration point between the two halves — schema/auth changes affect both `frontend/` and `backend/`.
- There is no test setup in either half yet; add one when introducing testable logic.
