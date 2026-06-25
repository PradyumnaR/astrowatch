# AstroWatch — Frontend

AstroWatch is a satellite-tracking app that plots orbits from TLE data on a map.
This Next.js frontend is the user-facing half: auth, the sky planner, and the "my satellites" views.
It talks to Supabase directly and to the Python/FastAPI backend for orbit propagation and the AI agent layer.

## Tech Stack

- **[Next.js](https://nextjs.org) 16.2.9** (App Router) with **React 19.2.4** and **TypeScript 5**
- **[Tailwind CSS](https://tailwindcss.com) v4** for styling
- **[Clerk](https://clerk.com)** (`@clerk/nextjs`) for authentication
- **[Supabase](https://supabase.com)** (`@supabase/supabase-js`) for database/auth, with the Supabase CLI as a devDependency
- **AI** via the [Vercel AI SDK](https://sdk.vercel.ai) (`ai`, `@ai-sdk/react`) and Anthropic (`@ai-sdk/anthropic`, `@anthropic-ai/sdk`)
- **[Zustand](https://zustand-demo.pmnd.rs)** for client state, **react-markdown** for rendering, **maplibre-gl** typings for maps
- **ESLint 9** (`eslint-config-next`)

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Deploy on Vercel](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)
</content>
</invoke>
