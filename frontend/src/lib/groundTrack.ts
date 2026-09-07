import { lerpAngle } from "@/hooks/useLiveSatelliteTracking";
import type { Location, SatellitePass } from "@/types";

const EARTH_RADIUS_KM = 6371;

// Typical LEO altitude — close enough for the app's default tracked
// satellites (ISS ~408km, Tiangong ~340-450km, Hubble ~535km). This is a
// visualization aid ("roughly where is the pass on the map"), not a
// precision figure — we don't have real per-satellite orbital data
// client-side, and don't propagate orbits (no TLEs/SGP4), per this
// project's convention of delegating all of that to N2YO.
export const DEFAULT_SAT_ALTITUDE_KM = 420;

// Points sampled per pass segment (start→max, max→end) when building a
// trajectory — see buildPassTrajectory.
const SAMPLES_PER_SEGMENT = 24;

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

/**
 * Builds the pass's ground-track trajectory purely from its own known
 * angular shape (startAz/startEl → maxAz/maxEl → endAz/~0°) plus the
 * observer's location — deliberately independent of any live position
 * data, so it's stable no matter how many times the tracking UI remounts
 * (tab switch, page navigation, refresh): `pass` and `location` already
 * come from the Zustand store and don't change across any of that.
 *
 * Returns `2 * samplesPerSegment + 1` points: index `0` is the rise,
 * index `samplesPerSegment` is the peak, and the last index is the set —
 * the two segments share their boundary point instead of duplicating it.
 */
export function buildPassTrajectory(
  pass: SatellitePass,
  location: Location,
  samplesPerSegment: number = SAMPLES_PER_SEGMENT,
): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];

  const addSegment = (
    azFrom: number,
    elFrom: number,
    azTo: number,
    elTo: number,
    skipFirst: boolean,
  ) => {
    for (let i = skipFirst ? 1 : 0; i <= samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      const az = lerpAngle(azFrom, azTo, t);
      const el = elFrom + (elTo - elFrom) * t;
      points.push(lookAngleToGroundPoint(location.lat, location.lng, az, el));
    }
  };

  addSegment(pass.startAz, pass.startEl, pass.maxAz, pass.maxEl, false);
  addSegment(pass.maxAz, pass.maxEl, pass.endAz, 0, true);

  return points;
}
