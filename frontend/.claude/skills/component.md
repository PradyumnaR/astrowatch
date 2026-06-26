---
name: component
description: AstroWatch frontend component patterns — conventions for building React/Next.js 16 components in `_components` folders. Use when creating or editing any component under `frontend/src/app`.
---

# AstroWatch component patterns

Conventions distilled from the existing components in
`frontend/src/app/dashboard/**/_components`. Follow these so new components match
what's already there.

## Where components live

- **Route-private components** go in a `_components/` folder next to the route
  that uses them: `app/dashboard/<route>/_components/Foo.tsx`. The `_` prefix
  keeps them out of the Next.js App Router's route resolution.
- **Truly shared, route-agnostic** components go in `frontend/src/components/`
  (e.g. `ProgressBar.tsx`). Promote here only when used by 2+ routes.
- One component per file, **`export default function ComponentName(...)`**, file
  named in PascalCase matching the component.

> ⚠️ This is **Next.js 16** — read the relevant guide in
> `frontend/node_modules/next/dist/docs/` before using framework APIs. Don't
> assume older Next.js conventions.

## Client vs server components

- Add `"use client";` as the **first line** only when the component uses hooks,
  browser APIs, the Zustand store, or event handlers.
- Keep presentational/leaf components (e.g. `ConditionRow`, `ScoreBadge`,
  `ViewingScore`, `ProgressBar`, `PassItem`) as **plain server components** — no
  `"use client"`, no hooks, props in / JSX out.
- A parent already marked `"use client"` lets its children be client too, but
  prefer keeping leaves server-renderable when they're pure.

## Props & typing

- Type props with an **inline object literal** in the parameter list. We do not
  declare separate `interface FooProps` for small components:

  ```tsx
  export default function ConditionRow({
    icon,
    label,
    value,
    children,
  }: {
    icon: string;
    label: string;
    value: string;
    children?: ReactNode;
  }) { ... }
  ```

- Children are typed as `ReactNode` (imported from `react`) or
  `React.ReactNode`.
- Import shared domain types from `@/types` (`SatellitePass`, `WeatherData`,
  `Location`, `SavedSatellite`, `CelestrakSatellite`, …). Never redefine them
  locally.
- Use the `@/*` path alias (maps to `frontend/src/*`) for all internal imports.

## State management

- Global/shared state lives in the **Zustand store** at `@/stores/astrowatch`,
  accessed via `useAstroStore()`:

  ```tsx
  const { selectedPass, weather, setWeather } = useAstroStore();
  ```

- Keep **local UI state** (`useState`) in the component: tab selection, input
  text, loading flags for component-local fetches, debounce refs.
- Store setters follow the `setX` / `addX` / `removeX` naming already in the
  store. Add new state to `stores/astrowatch.ts` (interface + creator) rather
  than threading props deeply.

## Data fetching

- Components fetch from internal Next.js API routes with `fetch("/api/...")`
  inside a `useEffect`, wrapped in an async function declared in the effect.
- Always use **try / catch / finally** with a loading flag; `console.error` on
  failure:

  ```tsx
  async function load() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/...`);
      setData(await res.json());
    } catch (err) {
      console.error("Descriptive message:", err);
    } finally {
      setIsLoading(false);
    }
  }
  ```

- Parallelize independent requests with `Promise.all` (see `PassList`).
- Debounce text-driven fetches with a `setTimeout` ref + cleanup (see
  `BrowseTab`).
- For values that change but shouldn't re-create a transport/effect, mirror them
  into a `useRef` and read `.current` (see `ChatPanel`'s `locationRef`).

## Loading & empty states

Every data component handles three states explicitly:

- **Loading** → skeleton blocks: `bg-white/5 animate-pulse` with `rounded`/
  `rounded-xl`, sized via fixed heights or inline `width` %. Extract a dedicated
  `XSkeleton` component when the skeleton is non-trivial (see `WeatherSkeleton`),
  or inline a small `.map` of pulse divs.
- **Empty** → muted helper text, e.g.
  `<p className="text-white/20 text-xs">No visible passes tonight</p>`, often
  with suggestion chips (see `ChatPanel`).
- **Loaded** → the real content.

Guard early with a skeleton when the key data is null:

```tsx
if (!weather) return <WeatherSkeleton />;
```

## Styling

Tailwind v4, dark theme. Use the **`aw-*` design tokens** (defined in
`app/globals.css` `@theme`) — never hardcode hex equivalents:

| Token        | Use                                       |
| ------------ | ----------------------------------------- |
| `aw-bg`      | app background `#0d0d1a`                  |
| `aw-surface` | raised surface `#1e1e3a`                  |
| `aw-purple`  | primary / accent / active state `#7c6ff7` |
| `aw-teal`    | success / "good" `#2dd4a0`                |
| `aw-amber`   | warning / "okay" `#f5a623`                |
| `aw-border`  | hairline borders `rgba(255,255,255,.08)`  |

Recurring conventions:

- **Text on dark**: layer opacity with `text-white/30`, `text-white/40`,
  `text-white/60`, `text-white/80`. Pure `text-white` for primary values only.
- **Surfaces / cards**: `bg-white/[0.03]`–`bg-white/5`, `border border-aw-border`,
  `rounded-xl`. Subtle fills use arbitrary opacity like `bg-white/[0.04]`.
- **Tiny type**: micro labels use `text-[10px]`/`text-[11px]`; values
  `text-[12px]`/`text-[13px]`. Section labels are
  `text-[10px] font-medium tracking-widest uppercase text-white/30`.
- **Interactive**: always add `transition-colors` (or `transition-opacity`),
  `hover:` states, and `disabled:opacity-*` / `disabled:cursor-not-allowed`.
- **Accent states**: active/selected use `aw-purple` at low opacity
  (`bg-aw-purple/15`, `border-aw-purple`, `text-aw-purple`).
- **Score/severity color ramp** (reused across `ScoreBadge`, `ViewingScore`,
  `WeatherPanel`): `>= 8` → teal, `>= 5` → amber, else muted/red. Keep these
  thresholds consistent.
- Emoji are used directly as inline icons (`☁ 🌙 🌡 💨 ⏱ ↑ ⏳`).
- For multi-condition class strings, either an array `.join(" ")` (see
  `NavLink`, `PassItem`) or a template literal with a ternary — both are in use.

## Composition

- Small private sub-components for a single file may be defined **below** the
  default export in the same file (e.g. `SectionLabel`, `StatusIcon`, `iconBg`
  helpers in `WeatherPanel` / `LocationDetector`).
- Reusable leaf UI gets its own file in the same `_components` folder.
- Helper logic (formatting, scoring, geocoding, moon phase) lives in `@/lib/*`
  (`formatPassTime`, `computeScore`, `getMoonPhase`, `reverseGeocode`), **not**
  inline in components.

## Quick skeleton for a new data component

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import type { SomeType } from "@/types";

export default function Foo() {
  const { location } = useAstroStore();
  const [data, setData] = useState<SomeType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!location) return;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/foo?lat=${location.lat}`);
        setData(await res.json());
      } catch (err) {
        console.error("Foo fetch failed:", err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [location?.lat, location?.lng]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-medium tracking-widest uppercase text-white/30">
        Foo
      </p>
      {isLoading && (
        <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
      )}
      {!isLoading && !data && (
        <p className="text-white/20 text-xs">Nothing to show</p>
      )}
      {!isLoading && data && <div className="...">{/* content */}</div>}
    </div>
  );
}
```
