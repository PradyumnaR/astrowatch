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
    passes,
    setPasses,
    setSelectedPass,
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

  return <></>;
}
