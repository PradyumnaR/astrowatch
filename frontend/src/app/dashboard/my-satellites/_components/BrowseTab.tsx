"use client";

import { useState, useEffect, useRef } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import type { CelestrakSatellite, SavedSatellite } from "@/types";

const CATEGORIES = [
  { key: "stations", label: "Stations" },
  { key: "weather", label: "Weather" },
  { key: "science", label: "Science" },
  { key: "gps", label: "GPS" },
  { key: "starlink", label: "Starlink" },
  { key: "amateur", label: "Amateur" },
];

export default function BrowseTab() {
  const {
    savedSatellites,
    addSaved,
    setPassCache,
    savedPasses,
    setSavedPasses,
    location,
  } = useAstroStore();

  const [category, setCategory] = useState("stations");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CelestrakSatellite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  // debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    fetchSatellites(category, "");
    setQuery("");
  }, [category]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchSatellites(category, query);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function fetchSatellites(cat: string, q: string) {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ category: cat });
      if (q) params.set("q", q);

      const res = await fetch(`/api/satellites/search?${params}`);
      const data = (await res.json()) as CelestrakSatellite[];
      setResults(data);
    } catch (err) {
      console.error("Browse fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function isSaved(noradId: number): boolean {
    return savedSatellites.some((s) => s.noradId === noradId);
  }

  async function handleSave(sat: CelestrakSatellite) {
    if (isSaved(sat.noradId) || savingId === sat.noradId) return;
    setSavingId(sat.noradId);

    try {
      const res = await fetch("/api/saved-satellites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          noradId: sat.noradId,
          satName: sat.satName,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      const saved = (await res.json()) as SavedSatellite;
      // 2 — add to Zustand store immediately
      addSaved(saved);

      // // 3 — fetch 7-day passes from N2YO for this satellite
      // if (location) {
      //   await fetchAndCachePasses(sat.noradId, sat.satName);
      // }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSavingId(null);
    }
  }

  // async function fetchAndCachePasses(noradId: number, satName: string) {
  //   if (!location) return;

  //   try {
  //     const res = await fetch(
  //       `/api/passes?id=${noradId}` +
  //         `&lat=${location.lat}` +
  //         `&lng=${location.lng}&days=7`,
  //     );

  //     const data = await res.json();

  //     const enriched = data.map((p: any) => ({
  //       ...p,
  //       satid: noradId,
  //       satname: satName,
  //     }));

  //     // cache in Zustand
  //     setPassCache(noradId, enriched);
  //     const updated = [...savedPasses, ...enriched].sort(
  //       (a, b) => a.startUTC - b.startUTC,
  //     );
  //     setSavedPasses(updated);
  //   } catch (err) {
  //     console.error("Pass fetch failed:", err);
  //   }
  // }

  return (
    <div className="flex flex-col gap-3">
      {/* search input */}
      <div
        className="flex items-center gap-2
        bg-white/[0.04] border border-aw-border
        rounded-lg px-3 py-2"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/25 flex-shrink-0"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or NORAD ID..."
          className="flex-1 bg-transparent text-[12px]
            text-white/60 placeholder:text-white/20
            outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-white/20 hover:text-white/40
              text-sm transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* category chips */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`px-2.5 py-1 rounded-full text-[10px]
              font-medium border transition-colors
              ${
                category === cat.key
                  ? "bg-aw-purple/15 border-aw-purple/40 text-aw-purple"
                  : "border-aw-border text-white/30 hover:text-white/50 hover:border-white/15"
              }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* section label */}
      <p
        className="text-[10px] font-medium tracking-widest
        uppercase text-white/25"
      >
        {query
          ? `Results for "${query}"`
          : `${CATEGORIES.find((c) => c.key === category)?.label ?? ""} satellites`}
      </p>

      {/* results list */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-10 rounded-lg bg-white/[0.03]
                animate-pulse"
            />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="text-[11px] text-white/20 py-4 text-center">
          No satellites found
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {results.map((sat) => {
            const saved = isSaved(sat.noradId);
            const saving = savingId === sat.noradId;

            return (
              <div
                key={sat.noradId}
                className="flex items-center justify-between
                  gap-2 px-2 py-2 rounded-lg
                  hover:bg-white/[0.03] transition-colors"
              >
                {/* satellite info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[12px] font-medium text-white
                    truncate"
                  >
                    {sat.satName}
                  </p>
                  <p className="text-[10px] text-white/25">
                    #{sat.noradId} · {sat.category}
                  </p>
                </div>

                {/* save button */}
                <button
                  onClick={() => handleSave(sat)}
                  disabled={saved || saving}
                  className={`flex-shrink-0 flex items-center
                    gap-1 px-2.5 py-1 rounded-full text-[10px]
                    font-medium border transition-colors
                    ${
                      saved
                        ? "border-aw-teal/30 text-aw-teal bg-aw-teal/8 cursor-default"
                        : saving
                          ? "border-aw-border text-white/20 cursor-wait"
                          : "border-aw-purple/35 text-aw-purple bg-aw-purple/8 hover:bg-aw-purple/15"
                    }`}
                >
                  {saved ? "✓ Saved" : saving ? "..." : "+ Save"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
