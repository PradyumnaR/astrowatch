import { describe, it, expect } from "vitest";
import {
  lookAngleToGroundPoint,
  buildPassTrajectory,
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

  it("returns 2*samplesPerSegment + 1 points", () => {
    const trajectory = buildPassTrajectory(pass, location, 10);
    expect(trajectory).toHaveLength(21);
  });

  it("starts at the pass's rise angle, peaks at max elevation, ends at the set angle", () => {
    const samples = 10;
    const trajectory = buildPassTrajectory(pass, location, samples);

    expect(trajectory[0]).toEqual(
      lookAngleToGroundPoint(location.lat, location.lng, pass.startAz, pass.startEl),
    );
    expect(trajectory[samples]).toEqual(
      lookAngleToGroundPoint(location.lat, location.lng, pass.maxAz, pass.maxEl),
    );
    expect(trajectory[trajectory.length - 1]).toEqual(
      lookAngleToGroundPoint(location.lat, location.lng, pass.endAz, 0),
    );
  });

  it("is deterministic — identical inputs always produce identical output", () => {
    const a = buildPassTrajectory(pass, location);
    const b = buildPassTrajectory(pass, location);
    expect(a).toEqual(b);
  });
});
