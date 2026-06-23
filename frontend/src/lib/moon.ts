const LUNAR_CYCLE = 29.53058867;
const KNOWN_NEW_MOON = new Date("2000-01-06T18:14:00Z").getTime();

// always returns positive remainder
function posMod(n: number, d: number): number {
  return ((n % d) + d) % d;
}

export function getMoonPhase(utcTimestamp: number): {
  phase: string;
  illumination: number;
} {
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceNew = (utcTimestamp * 1000 - KNOWN_NEW_MOON) / msPerDay;
  const daysInCycle = posMod(daysSinceNew, LUNAR_CYCLE);
  const cyclePos = daysInCycle / LUNAR_CYCLE;

  const illumination = (1 - Math.cos(2 * Math.PI * cyclePos)) / 2;

  const phase =
    cyclePos < 0.0625
      ? "New moon"
      : cyclePos < 0.1875
        ? "Waxing crescent"
        : cyclePos < 0.3125
          ? "First quarter"
          : cyclePos < 0.4375
            ? "Waxing gibbous"
            : cyclePos < 0.5625
              ? "Full moon"
              : cyclePos < 0.6875
                ? "Waning gibbous"
                : cyclePos < 0.8125
                  ? "Last quarter"
                  : cyclePos < 0.9375
                    ? "Waning crescent"
                    : "New moon";

  return {
    phase,
    illumination: Math.round(illumination * 100) / 100,
  };
}
