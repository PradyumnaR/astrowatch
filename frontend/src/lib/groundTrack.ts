import type { Location, SatellitePass } from "@/types";

const EARTH_RADIUS_KM = 6371;

// Typical LEO altitude — close enough for the app's default tracked
// satellites (ISS ~408km, Tiangong ~340-450km, Hubble ~535km) until a live
// position fix supplies the satellite's real altitude. This is a
// visualization aid ("roughly where is the pass on the map"), not a
// precision figure — we don't have real per-satellite orbital data
// client-side, and don't propagate orbits (no TLEs/SGP4), per this
// project's convention of delegating all of that to N2YO.
export const DEFAULT_SAT_ALTITUDE_KM = 420;

// Points sampled along the whole pass when building a trajectory line — see
// buildPassTrajectory.
const DEFAULT_TOTAL_SAMPLES = 48;

// Keeps a value just inside (0, 1) — used to keep the peak's time fraction
// away from the segment endpoints, where the quadratic fit below would
// otherwise become numerically degenerate.
const T_EPSILON = 0.01;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Converts an observer-relative look angle (azimuth/elevation) into the
 * satellite's approximate ground point (sub-satellite lat/lng), via
 * standard topocentric-horizon → geocentric triangle geometry:
 *   1. Slant range `d` from the observer to the satellite, from the law of
 *      cosines using the elevation angle.
 *   2. The Earth-centered angle `γ` between the observer and the
 *      sub-satellite point, from a second law-of-cosines step.
 *   3. The standard great-circle "destination point given a start, a
 *      bearing, and an angular distance" formula, using `γ` as the
 *      angular distance and the azimuth as the bearing.
 *
 * This assumes a fixed altitude (see DEFAULT_SAT_ALTITUDE_KM) since exact
 * orbital data isn't available here — deliberately not survey-grade, just
 * enough to place a point sensibly on a map.
 */
export function lookAngleToGroundPoint(
  observerLat: number,
  observerLng: number,
  azimuthDeg: number,
  elevationDeg: number,
  altitudeKm: number = DEFAULT_SAT_ALTITUDE_KM,
): { lat: number; lng: number } {
  const Re = EARTH_RADIUS_KM;
  const Rs = Re + altitudeKm;
  const el = toRad(Math.max(elevationDeg, 0));
  const az = toRad(azimuthDeg);

  const sinEl = Math.sin(el);
  const d = -Re * sinEl + Math.sqrt(Re * Re * sinEl * sinEl + Rs * Rs - Re * Re);

  const cosGamma = (Re * Re + Rs * Rs - d * d) / (2 * Re * Rs);
  const gamma = Math.acos(Math.min(1, Math.max(-1, cosGamma)));

  const lat1 = toRad(observerLat);
  const lon1 = toRad(observerLng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(gamma) +
      Math.cos(lat1) * Math.sin(gamma) * Math.cos(az),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(az) * Math.sin(gamma) * Math.cos(lat1),
      Math.cos(gamma) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: toDeg(lon2) };
}

// Unwraps a1/a2 relative to a0 by always taking the shortest signed path
// around the compass (e.g. 350° → 10° becomes +20°, not +360°-ish), the
// same logic useLiveSatelliteTracking's lerpAngle uses for a single pair —
// applied here across all 3 points so the whole sequence is continuous
// (safe to fit a polynomial through) even for a pass whose azimuth crosses
// the 0°/360° seam.
function unwrapAngleSequence(
  a0: number,
  a1: number,
  a2: number,
): [number, number, number] {
  const shortestDelta = (from: number, to: number) =>
    ((to - from + 540) % 360) - 180;
  const u1 = a0 + shortestDelta(a0, a1);
  const u2 = u1 + shortestDelta(u1, a2);
  return [a0, u1, u2];
}

// Standard 3-point Lagrange quadratic interpolation: the unique quadratic
// polynomial passing through (t0,v0), (t1,v1), (t2,v2), evaluated at `t`.
// Being a single polynomial (not two pasted-together linear segments), its
// derivative is continuous everywhere — no seam/kink at t1.
function quadraticThroughPoints(
  t0: number,
  v0: number,
  t1: number,
  v1: number,
  t2: number,
  v2: number,
  t: number,
): number {
  const l0 = ((t - t1) * (t - t2)) / ((t0 - t1) * (t0 - t2));
  const l1 = ((t - t0) * (t - t2)) / ((t1 - t0) * (t1 - t2));
  const l2 = ((t - t0) * (t - t1)) / ((t2 - t0) * (t2 - t1));
  return v0 * l0 + v1 * l1 + v2 * l2;
}

/**
 * Builds the pass's ground-track trajectory purely from its own known
 * angular shape (startAz/startEl → maxAz/maxEl → endAz/~0°) plus the
 * observer's location — deliberately independent of any live position
 * data, so it's stable no matter how many times the tracking UI remounts
 * (tab switch, page navigation, refresh): `pass` and `location` already
 * come from the Zustand store and don't change across any of that.
 *
 * Elevation and (circularly-unwrapped) azimuth are each fit with a single
 * quadratic through the three known (time, angle) points — rather than two
 * independent linear segments — so the line has no directional kink at the
 * peak; real ground tracks are smooth curves, and Max El is just the
 * closest-approach point along one, not a pivot. The peak's time fraction
 * is taken from the pass's actual timing (`maxUTC` relative to
 * `startUTC`/`endUTC`), not assumed to be the midpoint.
 *
 * `start`/`peak`/`end` are the pass's known points exactly (the quadratic
 * fit passes through them by construction); `line` is `totalSamples + 1`
 * points sampled across the whole curve for drawing.
 */
export function buildPassTrajectory(
  pass: SatellitePass,
  location: Location,
  totalSamples: number = DEFAULT_TOTAL_SAMPLES,
  altitudeKm: number = DEFAULT_SAT_ALTITUDE_KM,
): {
  line: { lat: number; lng: number }[];
  start: { lat: number; lng: number };
  peak: { lat: number; lng: number };
  end: { lat: number; lng: number };
} {
  const { startUTC, maxUTC, endUTC, startAz, maxAz, endAz, startEl, maxEl } =
    pass;
  const duration = Math.max(endUTC - startUTC, 1);
  const tPeak = Math.min(
    Math.max((maxUTC - startUTC) / duration, T_EPSILON),
    1 - T_EPSILON,
  );

  const [az0, az1, az2] = unwrapAngleSequence(startAz, maxAz, endAz);
  const toPoint = (az: number, el: number) =>
    lookAngleToGroundPoint(
      location.lat,
      location.lng,
      ((az % 360) + 360) % 360,
      Math.max(el, 0),
      altitudeKm,
    );

  const line: { lat: number; lng: number }[] = [];
  for (let i = 0; i <= totalSamples; i++) {
    const t = i / totalSamples;
    const az = quadraticThroughPoints(0, az0, tPeak, az1, 1, az2, t);
    const el = quadraticThroughPoints(0, startEl, tPeak, maxEl, 1, 0, t);
    line.push(toPoint(az, el));
  }

  return {
    line,
    start: toPoint(startAz, startEl),
    peak: toPoint(maxAz, maxEl),
    end: toPoint(endAz, 0),
  };
}
