"use client";

import { useEffect, useState } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import { getWeatherAtHour } from "@/lib/getWeatherAtHour";
import { azToCompass } from "@/lib/compass";
import PassItem from "./PassItem";
import type { SatellitePass } from "@/types";

const DEFAULT_SATS = [
  { id: 25544, name: "ISS" },
  { id: 48274, name: "Tiangong (CSS)" },
  { id: 20580, name: "Hubble (HST)" },
];

const DEFAULT_DAYS = 1;

type Tabs = "default" | "my-passes";

// Builds a pass window that reads as "active" right now, for the real ISS.
// Used only by the dev/testing "Simulate active pass" button below — lets
// the map + compass in SatelliteMapCompass be exercised (against genuine
// live /api/positions data) without waiting for an actual visible pass.
function buildSimulatedPass(): SatellitePass {
  const now = Math.floor(Date.now() / 1000);
  const startUTC = now - 10;
  const maxUTC = now + 90;
  const endUTC = now + 180;
  const startAz = 200;
  return {
    satid: 25544,
    satname: "ISS (ZARYA)",
    startAz,
    startAzCompass: azToCompass(startAz),
    startEl: 10,
    startUTC,
    maxAz: 270,
    maxEl: 60,
    maxUTC,
    endAz: 10,
    endUTC,
    mag: -3.0,
    duration: endUTC - startUTC,
  };
}

export default function PassList() {
  const {
    location,
    passes,
    selectedPass,
    isLoadingPasses,
    setPasses,
    setSelectedPass,
    setLoadingPasses,
    setWeather,
    weatherOm,
  } = useAstroStore();

  const [activeTab, setActiveTab] = useState<Tabs>("default");
  const [watchedPasses, setWatchedPasses] = useState<SatellitePass[]>([]);
  const [isLoadingWatched, setIsLoadingWatched] = useState(false);
  const [showSimulate, setShowSimulate] = useState(false);

  // Reveal the "Simulate active pass" testing button locally (always) and on
  // any deployed URL when opted into via ?simulate — including the PR's
  // Vercel preview, which otherwise builds with NODE_ENV=production like any
  // deploy. Deliberately deferred to a post-mount effect (same pattern as
  // useTheme.ts/useDeviceOrientation.ts elsewhere in this codebase) rather
  // than read during render, since `window` isn't available during SSR and
  // reading it at render time would produce a server/client markup mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowSimulate(
      process.env.NODE_ENV !== "production" ||
        new URLSearchParams(window.location.search).has("simulate"),
    );
  }, []);

  // fetch watched passes when tab is activated
  useEffect(() => {
    if (activeTab !== "my-passes") return;
    fetchWatchedPasses();
  }, [activeTab]);

  async function fetchWatchedPasses() {
    setIsLoadingWatched(true);
    try {
      const res = await fetch("/api/watched-passes");
      const data = await res.json();
      // pass_data contains the full enriched pass object
      const passes = data.map((p: any) => p.passData);
      setWatchedPasses(passes);
    } catch (err) {
      console.error("Failed to fetch watched passes:", err);
    } finally {
      setIsLoadingWatched(false);
    }
  }

  useEffect(() => {
    if (!location?.lat || !location?.lng) {
      return;
    }
    if (!weatherOm?.hourly) {
      return;
    }

    console.log(location);

    async function fetchPassesAndWeather() {
      try {
        setLoadingPasses(true);
        const passResults = await Promise.all(
          DEFAULT_SATS.map((sat) =>
            fetch(
              `/api/passes?id=${sat.id}&lat=${location?.lat}&lng=${location!.lng}&days=${DEFAULT_DAYS}`,
            ).then((r) => r.json()),
          ),
        );
        // flatten, add viewingScore, sort best first
        const rawPasses: SatellitePass[] = passResults.flat();
        const hourly = weatherOm?.hourly;

        if (
          !hourly?.time ||
          !hourly?.cloudCover ||
          !hourly?.temperature ||
          !hourly?.windSpeed
        ) {
          throw new Error("Hourly weather data missing");
        }
        const enriched = rawPasses
          .map((p) => {
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
          })
          .sort((a, b) => (b.viewingScore ?? 0) - (a.viewingScore ?? 0));

        setPasses(enriched);

        // auto-select best pass
        const best = enriched[0];
        if (best) {
          setSelectedPass(best);
          // set weather display values from best pass
          // WeatherPanel just reads this
          setWeather({
            viewingScore: best.viewingScore ?? 0,
            cloudCover: best.cloudCover ?? 20,
            temperature: best.temperature ?? 65,
            windSpeed: best.windSpeed ?? 5,
            moonPhase: best.moonPhase ?? "Unknown",
            moonIllumination: best.moonIllumination ?? 0.3,
            bortle: 5,
            mag: best.mag,
          });
        }
      } catch (err) {
        console.error("Unable to fetch passes and weather data", err);
      } finally {
        setLoadingPasses(false);
      }
    }

    fetchPassesAndWeather();
  }, [location?.alt, location?.lng, weatherOm]);

  // update weather display when user clicks a different pass
  const handlePassClick = (pass: SatellitePass) => {
    setSelectedPass(pass);
    // update WeatherPanel to show conditions for this pass
    setWeather({
      viewingScore: pass.viewingScore ?? 0,
      cloudCover: pass.cloudCover ?? 20,
      temperature: pass.temperature ?? 65,
      windSpeed: pass.windSpeed ?? 5,
      moonPhase: pass.moonPhase ?? "Unknown",
      moonIllumination: pass.moonIllumination ?? 0.3,
      bortle: 5,
      mag: pass.mag,
    });
  };

  return (
    <div>
      <div
        className="flex gap-1 p-1 rounded-lg
      bg-aw-tint border border-aw-border"
      >
        <button
          onClick={() => setActiveTab("default")}
          className={`cursor-pointer flex-1 py-1.5 rounded-md
          text-[11px] font-medium transition-colors
          ${
            activeTab === "default"
              ? "bg-aw-purple/20 text-aw-purple"
              : "text-aw-text-muted hover:text-aw-text-sec"
          }`}
        >
          Default Passes
        </button>
        <button
          onClick={() => setActiveTab("my-passes")}
          className={`cursor-pointer flex-1 py-1.5 rounded-md
          text-[11px] font-medium transition-colors
          ${
            activeTab === "my-passes"
              ? "bg-aw-purple/20 text-aw-purple"
              : "text-aw-text-muted hover:text-aw-text-sec"
          }`}
        >
          Passes watchlist
        </button>
      </div>

      {showSimulate && (
        <button
          onClick={() => handlePassClick(buildSimulatedPass())}
          className="cursor-pointer w-full mt-2 py-1 rounded-md text-[10px]
          text-aw-text-muted hover:text-aw-purple border border-dashed
          border-aw-border hover:border-aw-purple/45 transition-colors"
          title="Selects the real ISS with a pass window that reads as active right now, for testing the live map + compass."
        >
          🧪 Simulate active ISS pass (testing)
        </button>
      )}

      {activeTab == "default" && (
        <div className="pt-2">
          {" "}
          {/* loading skeletons */}
          {isLoadingPasses && <PassesSkeleton />}
          {/* pass items */}
          {!isLoadingPasses && (
            <div className="flex flex-col gap-1.5">
              {passes.map((pass) => (
                <PassItem
                  key={`${pass.satid}-${pass.startUTC}`}
                  pass={pass}
                  isSelected={
                    selectedPass?.startUTC === pass.startUTC &&
                    selectedPass?.satid === pass.satid
                  }
                  onClick={() => handlePassClick(pass)}
                />
              ))}
              {passes.length === 0 && (
                <p className="text-aw-text-muted text-xs pt-2">
                  No visible passes tonight
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab == "my-passes" && (
        <div className="pt-2">
          {isLoadingWatched && <PassesSkeleton />}
          {!isLoadingWatched && watchedPasses.length === 0 && (
            <p className="text-aw-text-muted text-[11px] pt-2">
              To view My Passes, navigate to My Satellites → Browse tab and save
              one or more satellites. Then, from the My Satellites table, select
              the Watch Passes action for the satellite you want to view passes
              for.
            </p>
          )}
          {!isLoadingWatched && (
            <div className="flex flex-col gap-1.5">
              {watchedPasses.map((pass) => (
                <PassItem
                  key={`${pass.satid}-${pass.startUTC}`}
                  pass={pass}
                  isSelected={
                    selectedPass?.startUTC === pass.startUTC &&
                    selectedPass?.satid === pass.satid
                  }
                  onClick={() => handlePassClick(pass)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PassesSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-xl bg-aw-tint animate-pulse" />
      ))}
    </div>
  );
}
