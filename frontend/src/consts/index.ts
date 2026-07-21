export const SAT_COLORS: Record<number, string> = {
  25544: "#2dd4a0", // ISS       → teal
  48274: "#4da6f5", // Tiangong  → blue
  33591: "#f5a623", // NOAA-19   → amber
  25338: "#f5a623", // NOAA-15   → amber
  28654: "#f5a623", // NOAA-18   → amber
  20580: "#a78bfa", // Hubble    → violet
};

export const DEFAULT_COLOR = "#7c6ff7";

export const DEFAULT_LOCATION = {
  lat: 34.18,
  lng: -118.31,
  name: "Burbank, CA",
  timezone: "America/Los_Angeles",
};

export const PLAN_LIMITS = {
  standard: {
    savedSatellites: 5,
    watchedPasses: 5,
  },
  pro: {
    savedSatellites: Infinity,
    watchedPasses: Infinity,
  },
} as const;

export const UserMessages = {
  SatLimitTitle: "Satellite limit reached",
  SatLimit:
    "You have reached the 5 satellite limit. We are working on a Pro version with unlimited satellites — stay tuned!",
  PassesLimitTitle: "Pass limit reached",
  PassesLimit:
    "You have reached the 5 watched pass limit. We are working on a Pro version with unlimited passes — stay tuned!",
};
