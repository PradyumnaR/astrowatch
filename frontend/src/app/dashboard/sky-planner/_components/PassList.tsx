"use client";

import { useEffect, useState } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import { getWeatherAtHour } from "@/lib/getWeatherAtHour";
import PassItem from "./PassItem";
import type { SatellitePass } from "@/types";

const DEFAULT_SATS = [
  { id: 25544, name: "ISS" },
  { id: 48274, name: "Tiangong (CSS)" },
  { id: 20580, name: "Hubble (HST)" },
];

const DEFAULT_DAYS = 1;

type Tabs = "default" | "my-passes";

function findHourIndex(times: string[], utcSecs: number): number {
  const passDate = new Date(Number(utcSecs) * 1000);
  const passDay = passDate.getDate();
  const passHour = passDate.getHours();

  console.log(passDate);

  const hourIndex = times.findIndex((t) => {
    const d = new Date(t);
    return d.getDate() === passDay && d.getHours() === passHour;
  });

  return hourIndex >= 0 ? hourIndex : 0;
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
      bg-white/[0.04] border border-aw-border"
      >
        <button
          onClick={() => setActiveTab("default")}
          className={`cursor-pointer flex-1 py-1.5 rounded-md
          text-[11px] font-medium transition-colors
          ${
            activeTab === "default"
              ? "bg-aw-purple/20 text-aw-purple"
              : "text-white/30 hover:text-white/60"
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
              : "text-white/30 hover:text-white/60"
          }`}
        >
          My passes
        </button>
      </div>

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
                <p className="text-white/20 text-xs pt-2">
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
            <p className="text-white/20 text-[11px] pt-2">
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
        <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
      ))}
    </div>
  );
}
