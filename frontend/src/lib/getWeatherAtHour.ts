import type { WeatherData } from "@/types";
import { getMoonPhase } from "./moon";

export function getWeatherAtHour(
  times: string[],
  cloudCover: number[],
  temperature: number[],
  windSpeed: number[],
  startUTC: number,
): WeatherData {
  const date = new Date(startUTC * 1000);
  const day = date.getDate();
  const hour = date.getHours();

  const idx = times.findIndex((t) => {
    const d = new Date(t);
    return d.getDate() === day && d.getHours() === hour;
  });

  const { phase: moonPhase, illumination: moonIllumination } =
    getMoonPhase(startUTC);

  return {
    cloudCover: cloudCover[idx] ?? 20,
    temperature: temperature[idx] ?? 65,
    windSpeed: windSpeed[idx] ?? 5,
    moonPhase,
    moonIllumination,
    bortle: 5,
  };
}
