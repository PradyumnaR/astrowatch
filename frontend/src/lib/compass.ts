const COMPASS_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** 8-point compass letter for an azimuth in degrees (0 = N, clockwise). */
export function azToCompass(az: number): string {
  return COMPASS_DIRS[Math.round(az / 45) % 8];
}
