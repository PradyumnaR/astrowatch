import { describe, it, expect } from "vitest";
import {
  lookAngleToGroundPoint,
  buildPassTrajectory,
  sampleTrajectoryPoint,
  DEFAULT_SAT_ALTITUDE_KM,
} from "@/lib/groundTrack";
import type { Location, SatellitePass } from "@/types";

const location: Location = {
  lat: 34.18,
  lng: -118.31,
  name: "Burbank, CA",
  timezone: "America/Los_Angeles",
};

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  // simple equirectangular approximation — plenty for a sanity check
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng) * 111;
}

// Local-plane bearing between two nearby points — good enough over the
// short distances in these tests, just needed to detect a sharp turn.
function bearingDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  return Math.atan2(b.lng - a.lng, b.lat - a.lat) * (180 / Math.PI);
}

function angleDiff(a: number, b: number) {
  return Math.abs(((b - a + 540) % 360) - 180);
}

describe("lookAngleToGroundPoint", () => {
  it("places a straight-up satellite essentially at the observer's own position", () => {
    const point = lookAngleToGroundPoint(location.lat, location.lng, 200, 90);
    expect(point.lat).toBeCloseTo(location.lat, 3);
    expect(point.lng).toBeCloseTo(location.lng, 3);
  });

  it("places a low-elevation satellite farther away than a high-elevation one", () => {
    const low = lookAngleToGroundPoint(location.lat, location.lng, 90, 10);
    const high = lookAngleToGroundPoint(location.lat, location.lng, 90, 60);
    expect(distanceKm(low, location)).toBeGreaterThan(distanceKm(high, location));
  });

  it("moves the ground point in the direction of the given azimuth", () => {
    // due east (az 90) at a low elevation should move mostly in longitude,
    // not latitude
    const east = lookAngleToGroundPoint(location.lat, location.lng, 90, 20);
    expect(east.lng).toBeGreaterThan(location.lng);
    expect(Math.abs(east.lat - location.lat)).toBeLessThan(
      Math.abs(east.lng - location.lng),
    );
  });

  it("respects a custom altitude (higher altitude -> farther ground point at the same elevation)", () => {
    const near = lookAngleToGroundPoint(location.lat, location.lng, 90, 20, 400);
    const far = lookAngleToGroundPoint(location.lat, location.lng, 90, 20, 2000);
    expect(distanceKm(far, location)).toBeGreaterThan(distanceKm(near, location));
  });

  it("has a sane default altitude", () => {
    expect(DEFAULT_SAT_ALTITUDE_KM).toBeGreaterThan(200);
    expect(DEFAULT_SAT_ALTITUDE_KM).toBeLessThan(1000);
  });
});

describe("buildPassTrajectory", () => {
  const pass: SatellitePass = {
    satid: 25544,
    satname: "ISS",
    startAz: 200,
    startAzCompass: "SSW",
    startEl: 10,
    startUTC: 1_700_000_300,
    maxAz: 270,
    maxEl: 60,
    maxUTC: 1_700_000_360,
    endAz: 10,
    endUTC: 1_700_000_420,
    mag: -2,
    duration: 120,
  };

  it("returns totalSamples + 1 line points", () => {
    const { line } = buildPassTrajectory(pass, location, 10);
    expect(line).toHaveLength(11);
  });

  it("start/peak/end match the pass's own known angles exactly", () => {
    const trajectory = buildPassTrajectory(pass, location, 10);

    expect(trajectory.start).toEqual(
      lookAngleToGroundPoint(location.lat, location.lng, pass.startAz, pass.startEl),
    );
    expect(trajectory.peak).toEqual(
      lookAngleToGroundPoint(location.lat, location.lng, pass.maxAz, pass.maxEl),
    );
    expect(trajectory.end).toEqual(
      lookAngleToGroundPoint(location.lat, location.lng, pass.endAz, 0),
    );
    // the fit passes through its nodes exactly, so the line's own first
    // and last samples (t=0 and t=1) match start/end too
    expect(trajectory.line[0]).toEqual(trajectory.start);
    expect(trajectory.line[trajectory.line.length - 1]).toEqual(
      trajectory.end,
    );
  });

  it("has no directional kink at the peak (a smooth curve, not two pasted linear segments)", () => {
    const { line } = buildPassTrajectory(pass, location, 48);

    const bearings: number[] = [];
    for (let i = 1; i < line.length; i++) {
      bearings.push(bearingDeg(line[i - 1], line[i]));
    }
    const turns = bearings.slice(1).map((b, i) => angleDiff(bearings[i], b));

    const sorted = [...turns].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = Math.max(...turns);

    // A genuine kink (two independent linear segments meeting at the peak)
    // produces one turn dramatically larger than the rest; a single smooth
    // quadratic fit doesn't have such a singular outlier.
    expect(max).toBeLessThan(median * 5 + 1);
  });

  it("threads a custom altitude through to every point", () => {
    const near = buildPassTrajectory(pass, location, 10, 400);
    const far = buildPassTrajectory(pass, location, 10, 2000);
    expect(distanceKm(far.start, location)).toBeGreaterThan(
      distanceKm(near.start, location),
    );
    expect(distanceKm(far.peak, location)).toBeGreaterThan(
      distanceKm(near.peak, location),
    );
  });

  it("is deterministic — identical inputs always produce identical output", () => {
    const a = buildPassTrajectory(pass, location);
    const b = buildPassTrajectory(pass, location);
    expect(a).toEqual(b);
  });
});

describe("sampleTrajectoryPoint", () => {
  const pass: SatellitePass = {
    satid: 25544,
    satname: "ISS",
    startAz: 200,
    startAzCompass: "SSW",
    startEl: 10,
    startUTC: 1_700_000_300,
    maxAz: 270,
    maxEl: 60,
    maxUTC: 1_700_000_360,
    endAz: 10,
    endUTC: 1_700_000_420,
    mag: -2,
    duration: 120,
  };

  it("matches the trajectory's own start/peak/end at those exact timestamps", () => {
    const trajectory = buildPassTrajectory(pass, location);

    const start = sampleTrajectoryPoint(pass, location, pass.startUTC);
    expect(start.lat).toBeCloseTo(trajectory.start.lat, 9);
    expect(start.lng).toBeCloseTo(trajectory.start.lng, 9);
    expect(start.azimuth).toBeCloseTo(pass.startAz, 6);
    expect(start.elevation).toBeCloseTo(pass.startEl, 6);

    const peak = sampleTrajectoryPoint(pass, location, pass.maxUTC);
    expect(peak.lat).toBeCloseTo(trajectory.peak.lat, 9);
    expect(peak.lng).toBeCloseTo(trajectory.peak.lng, 9);
    expect(peak.azimuth).toBeCloseTo(pass.maxAz, 6);
    expect(peak.elevation).toBeCloseTo(pass.maxEl, 6);

    const end = sampleTrajectoryPoint(pass, location, pass.endUTC);
    expect(end.lat).toBeCloseTo(trajectory.end.lat, 9);
    expect(end.lng).toBeCloseTo(trajectory.end.lng, 9);
    expect(end.azimuth).toBeCloseTo(pass.endAz, 6);
    expect(end.elevation).toBeCloseTo(0, 6);
  });

  it("lands on the same curve buildPassTrajectory's line samples, at the same time fraction", () => {
    const totalSamples = 10;
    const { line } = buildPassTrajectory(pass, location, totalSamples);
    const duration = pass.endUTC - pass.startUTC;

    for (let i = 0; i <= totalSamples; i++) {
      const utc = pass.startUTC + (duration * i) / totalSamples;
      const sample = sampleTrajectoryPoint(pass, location, utc);
      expect(sample.lat).toBeCloseTo(line[i].lat, 9);
      expect(sample.lng).toBeCloseTo(line[i].lng, 9);
    }
  });

  it("clamps timestamps outside the pass's own span", () => {
    const trajectory = buildPassTrajectory(pass, location);

    const before = sampleTrajectoryPoint(pass, location, pass.startUTC - 999);
    expect(before.lat).toBeCloseTo(trajectory.start.lat, 9);
    expect(before.lng).toBeCloseTo(trajectory.start.lng, 9);

    const after = sampleTrajectoryPoint(pass, location, pass.endUTC + 999);
    expect(after.lat).toBeCloseTo(trajectory.end.lat, 9);
    expect(after.lng).toBeCloseTo(trajectory.end.lng, 9);
  });

  it("threads a custom altitude through", () => {
    const near = sampleTrajectoryPoint(pass, location, pass.maxUTC, 400);
    const far = sampleTrajectoryPoint(pass, location, pass.maxUTC, 2000);
    expect(distanceKm(far, location)).toBeGreaterThan(
      distanceKm(near, location),
    );
  });
});
