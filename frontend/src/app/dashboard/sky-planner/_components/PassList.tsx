"use client";

import { useEffect } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import { computeScore } from "@/lib/viewing-score";
import { getMoonPhase } from "@/lib/moon";
import PassItem from "./PassItem";
import type { SatellitePass } from "@/types";

const DEFAULT_SATS = [
  { id: 25544, name: "ISS" },
  { id: 48274, name: "Tiangong (CSS)" },
  { id: 20580, name: "Hubble (HST)" },
];

const DEFAULT_DAYS = 1;

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
  } = useAstroStore();

  useEffect(() => {
    if (!location?.lat || !location?.lng) {
      return;
    }

    console.log(location);

    async function fetchPassesAndWeather() {
      try {
        setLoadingPasses(true);
        const [passResults, weatherRes] = await Promise.all([
          Promise.all(
            DEFAULT_SATS.map((sat) =>
              fetch(
                `/api/passes?id=${sat.id}&lat=${location?.lat}&lng=${location!.lng}&days=${DEFAULT_DAYS}`,
              ).then((r) => r.json()),
            ),
          ),
          fetch(`/api/weather?lat=${location?.lat}&lng=${location?.lng}`).then(
            (r) => r.json(),
          ),
        ]);

        // flatten, add viewingScore, sort best first
        const rawPasses: SatellitePass[] = passResults.flat();
        const hourly = weatherRes.hourly;

        // compute moon phase once — same for all passes
        // use middle of tonight as reference
        const moonRef = Math.floor(Date.now() / 1000);
        const { phase: moonPhase, illumination: moonIllumination } =
          getMoonPhase(moonRef);

        const enriched = rawPasses
          .map((p) => {
            const idx = findHourIndex(hourly.time, p.startUTC);

            console.log("times idx", idx, p);

            const cloudCover = hourly.cloudCover[idx] ?? 20;
            const temperature = hourly.temperature[idx] ?? 65;
            const windSpeed = hourly.windSpeed[idx] ?? 5;
            const bortle = 5;

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
            cloudCover: best.cloudCover ?? 20,
            temperature: best.temperature ?? 65,
            windSpeed: best.windSpeed ?? 5,
            moonPhase: best.moonPhase ?? "Unknown",
            moonIllumination: best.moonIllumination ?? 0.3,
            bortle: 5,
          });
        }
      } catch (err) {
        console.error("Unable to fetch passes and weather data", err);
      } finally {
        setLoadingPasses(false);
      }
    }

    fetchPassesAndWeather();
  }, [location?.alt, location?.lng]);

  // update weather display when user clicks a different pass
  const handlePassClick = (pass: SatellitePass) => {
    setSelectedPass(pass);
    // update WeatherPanel to show conditions for this pass
    setWeather({
      cloudCover: pass.cloudCover ?? 20,
      temperature: pass.temperature ?? 65,
      windSpeed: pass.windSpeed ?? 5,
      moonPhase: pass.moonPhase ?? "Unknown",
      moonIllumination: pass.moonIllumination ?? 0.3,
      bortle: 5,
    });
  };

  return (
    <div>
      <p
        className="text-[10px] font-medium tracking-widest
        uppercase text-white/30 mb-2"
      >
        Upcoming passes
      </p>

      {/* loading skeletons */}
      {isLoadingPasses && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      )}

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
  );
}
