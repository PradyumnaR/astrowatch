import { useAstroStore } from "@/stores/astrowatch";
import { SavedSatellite, CelestrakSatellite, SatellitePass } from "@/types";
import { getWeatherAtHour } from "@/lib/getWeatherAtHour";

export function useSavedSatellites() {
  const {
    setSavedSatellites,
    addSaved,
    removeSaved,
    setLoadingSaved,
    setSavedPasses,
    setIsLoadingSavedPasses,
    setPassCache,
    setWeatherOm,
    location,
  } = useAstroStore();

  async function initSavedSatAndPasses() {
    await fetchWeather();
    await fetchSavedSats();

    const latestSavedSats = useAstroStore.getState().savedSatellites;
    for (const sat of latestSavedSats) {
      await fetchAndSavePasses(sat);
    }
  }

  async function fetchSavedSats() {
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

  async function fetchWeather() {
    if (!location) return;

    try {
      const res = await fetch(
        `/api/weather?lat=${location.lat}&lng=${location.lng}&timezone=${location.timezone}`,
      );
      const wx = await res.json();
      setWeatherOm(wx);
    } catch (err) {
      console.error("Weather fetch failed:", err);
    }
  }

  async function handleSaveSat(sat: CelestrakSatellite) {
    try {
      const res = await fetch("/api/saved-satellites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          noradId: sat.noradId,
          satname: sat.satname,
        }),
      });

      if (res.status === 403) return "limit_reached";
      if (!res.ok) throw new Error("Failed to save");

      const saved = (await res.json()) as SavedSatellite;
      // 2 — add to Zustand store immediately
      addSaved(saved);
      await fetchAndSavePasses(saved);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }

  async function fetchAndSavePasses(sat: SavedSatellite) {
    const latestWeatherOm = useAstroStore.getState().weatherOm;
    const latestPassCache = useAstroStore.getState().passCache;
    const latestSavedPasses = useAstroStore.getState().savedPasses;

    if (!location) return;
    if (!latestWeatherOm?.hourly) return;

    const hourly = latestWeatherOm.hourly;

    if (
      !hourly?.time ||
      !hourly?.cloudCover ||
      !hourly.temperature ||
      !hourly.windSpeed
    ) {
      throw new Error("Hourly weather data missing");
    }
    try {
      setIsLoadingSavedPasses(true);
      const res = await fetch(
        `/api/passes?id=${sat.noradId}` +
          `&lat=${location.lat}` +
          `&lng=${location.lng}&days=7`,
      );
      const rawPasses = await res.json();

      const enrichedPasses = rawPasses.map((p: SatellitePass) => {
        const {
          cloudCover,
          temperature,
          moonIllumination,
          moonPhase,
          windSpeed,
          viewingScore,
        } = getWeatherAtHour(
          p.maxEl,
          hourly.time,
          hourly.cloudCover,
          hourly.temperature,
          hourly.windSpeed,
          p.startUTC,
          p.mag,
        );

        return {
          ...p,
          cloudCover,
          temperature,
          windSpeed,
          moonPhase,
          moonIllumination,
          viewingScore,
        };
      });
      setPassCache({ ...latestPassCache, [sat.noradId]: [...enrichedPasses] });
      setSavedPasses(
        [...latestSavedPasses, ...enrichedPasses].sort(
          (a, b) => a.startUTC - b.startUTC,
        ),
      );
    } catch (err) {
      console.error(`Failed to fetch passes for ${sat.satname}:`, err);
    } finally {
      setIsLoadingSavedPasses(false);
    }
  }

  async function handleRemoveSat(sat: SavedSatellite) {
    try {
      // const res = await fetch(`/api/saved-satellites/${sat.id}`, {
      //   method: "DELETE",
      // });
      // if (!res.ok) throw new Error("Failed to remove");

      await Promise.all([
        fetch(`/api/saved-satellites/${sat.noradId}`, {
          method: "DELETE",
        }),
        fetch(`/api/watched-passes/satellite/${sat.noradId}`, {
          method: "DELETE",
        }),
      ]);
      removeSaved(sat.noradId);
      handleRemovePass(sat.noradId);
    } catch (err) {
      console.error("Failed to remove saved satellite", err);
    }
  }

  // ── instant remove — no waiting for useEffect
  function handleRemovePass(noradId: number) {
    const latestPassCache = useAstroStore.getState().passCache;
    const latestSavedPasses = useAstroStore.getState().savedPasses;
    const updated = latestSavedPasses
      .filter((p) => p.satid != noradId)
      .sort((a, b) => a.startUTC - b.startUTC);

    setSavedPasses(updated);
    //removing cached pass.
    const newPassesCache = { ...latestPassCache };
    delete newPassesCache[noradId];
    setPassCache({ ...newPassesCache });
  }
  return {
    initSavedSatAndPasses,
    handleRemoveSat,
    handleSaveSat,
  };
}
