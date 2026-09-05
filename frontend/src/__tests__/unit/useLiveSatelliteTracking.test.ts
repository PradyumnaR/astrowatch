import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { renderHook } from "@testing-library/react";
import { useLiveSatelliteTracking } from "@/hooks/useLiveSatelliteTracking";
import type { Location, SatellitePass } from "@/types";

const BASE_SEC = 1_700_000_000;

const location: Location = {
  lat: 34.18,
  lng: -118.31,
  name: "Burbank, CA",
  timezone: "America/Los_Angeles",
};

function makePass(overrides: Partial<SatellitePass> = {}): SatellitePass {
  return {
    satid: 25544,
    satname: "ISS",
    startAz: 200,
    startAzCompass: "SSW",
    startEl: 10,
    startUTC: BASE_SEC + 300,
    maxAz: 270,
    maxEl: 60,
    maxUTC: BASE_SEC + 360,
    endAz: 10,
    endUTC: BASE_SEC + 420,
    mag: -2,
    duration: 120,
    ...overrides,
  };
}

describe("useLiveSatelliteTracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_SEC * 1000);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ positions: [] }),
        }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is 'no-pass' when nothing is selected", () => {
    const { result } = renderHook(() =>
      useLiveSatelliteTracking(null, location),
    );
    expect(result.current.phase).toBe("no-pass");
  });

  it("moves upcoming -> active -> ended as time advances", async () => {
    const pass = makePass();
    const { result } = renderHook(() =>
      useLiveSatelliteTracking(pass, location),
    );
    expect(result.current.phase).toBe("upcoming");

    // advance to exactly startUTC
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    expect(result.current.phase).toBe("active");

    // advance past endUTC
    await act(async () => {
      await vi.advanceTimersByTimeAsync(121_000);
    });
    expect(result.current.phase).toBe("ended");
  });

  it("does not fetch positions while a pass is more than 300s out", async () => {
    const pass = makePass({ startUTC: BASE_SEC + 400 });
    renderHook(() => useLiveSatelliteTracking(pass, location));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches /api/positions once the pass enters the 300s pre-window", async () => {
    const pass = makePass({ startUTC: BASE_SEC + 400 });
    renderHook(() => useLiveSatelliteTracking(pass, location));

    // 400s out initially; advance 100s to land exactly at the 300s boundary
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `/api/positions?id=${pass.satid}&lat=${location.lat}&lng=${location.lng}`,
      ),
    );
  });

  it("never fetches once a pass has already ended", async () => {
    const pass = makePass({
      startUTC: BASE_SEC - 400,
      maxUTC: BASE_SEC - 200,
      endUTC: BASE_SEC - 10,
    });
    renderHook(() => useLiveSatelliteTracking(pass, location));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
