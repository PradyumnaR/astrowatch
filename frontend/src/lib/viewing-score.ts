/**
 * Computes a 0–10 viewing score for a satellite pass.
 *
 * @param maxEl  - max elevation in degrees (0–90)
 * @param cloud  - cloud cover percentage (0–100)
 * @param moon   - moon illumination (0–1)
 * @param bortle - Bortle dark-sky scale (1–9, lower = darker)
 * @param mag - visual britness of the satellite. -2 to 6.
 * lower the value more brightness. If unknown value will be 1000
 */

const maxMag = 6.0; //human eyesight limit
const minMag = -4.0;

export function computeScore(
  maxEl: number,
  cloud: number = 20,
  moon = 0.3,
  bortle: number = 5,
  mag: number,
): number {
  // Clamp magnitude to our expected realistic boundaries
  const clampedMag = Math.max(minMag, Math.min(maxMag, mag));

  const score =
    (maxEl / 90) * 40 +
    ((100 - cloud) / 100) * 30 +
    ((maxMag - clampedMag) / (maxMag - minMag)) * 10 +
    (1 - moon) * 10 +
    ((9 - bortle) / 8) * 10;

  return Math.round(score) / 10;
}
