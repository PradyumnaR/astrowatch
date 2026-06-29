import { useEffect, useRef } from "react";
import { computeScore } from "@/lib/viewing-score";
import { getWeatherAtHour } from "@/lib/getWeatherAtHour";
import { getMoonPhase } from "@/lib/moon";
import { useAstroStore } from "@/stores/astrowatch";
import type {
  SavedSatellite,
  SatellitePass,
  WeatherApiResponse,
} from "@/types";

export function useSavedSatellites() {
  const {
    savedSatellites,
    setSavedSatellites,
    isLoadingSaved,
    setLoadingSaved,
    savedPasses,
    setSavedPasses,
    passCache,
    setPassCache,
    location,
  } = useAstroStore();

  // ref to prevent duplicate Supabase fetches
  // when multiple components call this hook
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    // already fetched or in progress → skip
    if (hasFetchedRef.current) return;
    if (isLoadingSaved) return;
    if (savedSatellites.length > 0) return;

    hasFetchedRef.current = true;
    async function fetchSaved() {
      setLoadingSaved(true);
      try {
        const res = await fetch("/api/saved-satellites");
        const data = (await res.json()) as SavedSatellite[];
        setSavedSatellites(data);
      } catch (err) {
        console.error("Failed to fetch saved satellites:", err);
      } finally {
        setLoadingSaved(false);
      }
    }

    fetchSaved();
  }, []);

  // ── Step 2: watch savedSatellites + location
  // handles initial load, add satellite, remove satellite
  useEffect(() => {
    if (!location) return;
    if (savedSatellites.length === 0) {
      // all removed — clear savedPasses
      setSavedPasses([]);
      return;
    }

    syncPasses();
  }, [savedSatellites.length, location?.lat, location?.lng]);

  async function syncPasses() {
    if (!location) return;

    // find satellites not in passCache
    const missing = savedSatellites.filter(
      (s) => !passCache[s.noradId] || passCache[s.noradId].length === 0,
    );

    try {
      await buildPasses(missing);
    } finally {
      setLoadingSaved(false);
    }
  }

  async function buildPasses(satellites: SavedSatellite[]) {
    const weatherRes = await fetchWeather();
    const hourly = weatherRes?.hourly;

    if (!hourly) return;

    const allPromises = satellites.map(async (s) => {
      try {
        const rawPasses = await fetchPasses(s);
        const enrichedPasses = rawPasses.map((p: SatellitePass) => {
          const {
            cloudCover,
            temperature,
            moonIllumination,
            moonPhase,
            windSpeed,
            bortle,
          } = getWeatherAtHour(
            hourly.time,
            hourly.cloudCover,
            hourly.temperature,
            hourly.windSpeed,
            p.startUTC,
          );

          return {
            ...p,
            cloudCover,
            temperature,
            windSpeed,
            moonPhase,
            moonIllumination,
            viewingScore: computeScore(
              p.maxEl,
              cloudCover,
              moonIllumination,
              bortle,
            ),
          };
        });
        setPassCache(s.noradId, enrichedPasses);
        return enrichedPasses;
      } catch (err) {
        console.log("Failed to fetch missing passes", err);
      }
    });

    const all = (await Promise.all(allPromises)).flat();
    setSavedPasses([...savedPasses, ...all]);
  }

  async function fetchPasses(sat: SavedSatellite) {
    if (!location) return;
    try {
      const res = await fetch(
        `/api/passes?id=${sat.noradId}` +
          `&lat=${location.lat}` +
          `&lng=${location.lng}&days=7`,
      );
      const data = await res.json();
      return data;
    } catch (err) {
      console.error(`Failed to fetch passes for ${sat.satName}:`, err);
    }
  }

  async function fetchWeather() {
    if (!location) return;

    try {
      const res = await fetch(
        `/api/weather?lat=${location.lat}&lng=${location.lng}`,
      );
      const wx = await res.json();
      return wx;
    } catch (err) {
      console.error("Weather fetch failed:", err);
    }
  }

  // ── instant remove — no waiting for useEffect
  function handleRemove(noradId: number) {
    const latestCache = useAstroStore.getState().passCache;
    const remaining = useAstroStore
      .getState()
      .savedSatellites.filter((s) => s.noradId !== noradId);

    const updated = remaining
      .flatMap((s) => latestCache[s.noradId] ?? [])
      .sort((a, b) => a.startUTC - b.startUTC);

    setSavedPasses(updated);
  }

  return {
    savedSatellites,
    isLoading: isLoadingSaved,
    handleRemove,
  };
}
