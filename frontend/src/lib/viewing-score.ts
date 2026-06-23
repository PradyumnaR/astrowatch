/**
 * Computes a 0–10 viewing score for a satellite pass.
 *
 * @param maxEl  - max elevation in degrees (0–90)
 * @param cloud  - cloud cover percentage (0–100)
 * @param moon   - moon illumination (0–1)
 * @param bortle - Bortle dark-sky scale (1–9, lower = darker)
 */
export function computeScore(
  maxEl: number,
  cloud: number = 20,
  moon = 0.3,
  bortle: number = 5,
): number {
  const score =
    (maxEl / 90) * 40 +
    ((100 - cloud) / 100) * 30 +
    (1 - moon) * 20 +
    ((9 - bortle) / 8) * 10;

  return Math.round(score) / 10;
}
