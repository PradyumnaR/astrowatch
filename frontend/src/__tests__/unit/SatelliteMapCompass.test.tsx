import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SatelliteMapCompass from "@/app/dashboard/sky-planner/_components/SatelliteMapCompass";
import { useAstroStore } from "@/stores/astrowatch";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useLiveSatelliteTracking } from "@/hooks/useLiveSatelliteTracking";
import type { Location, SatellitePass, SatellitePosition } from "@/types";

// Exposed so tests can assert what coordinates the ground-track source was
// last given, without reaching into the (mocked) maplibre-gl internals.
const groundTrackSource = { setData: vi.fn() };

// MapLibre needs a real WebGL canvas that jsdom can't provide. It's only
// ever exercised once phase === "active" (LiveMap mounts), but these
// chainable-builder mocks let that mount happen harmlessly so the tests can
// focus on this component's own render logic (permission gating, copy).
vi.mock("maplibre-gl", () => {
  class FakeMap {
    on = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    getSource = vi.fn(() => groundTrackSource);
    remove = vi.fn();
    isStyleLoaded = vi.fn(() => false);
    fitBounds = vi.fn();
  }
  class FakeMarker {
    setLngLat = vi.fn().mockReturnThis();
    setPopup = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
  }
  class FakePopup {
    setText = vi.fn().mockReturnThis();
  }
  class FakeLngLatBounds {
    extend = vi.fn().mockReturnThis();
  }
  return {
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
    LngLatBounds: FakeLngLatBounds,
  };
});
vi.mock("@/stores/astrowatch");
vi.mock("@/hooks/useDeviceOrientation");
vi.mock("@/hooks/useLiveSatelliteTracking");

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

const location: Location = {
  lat: 34.18,
  lng: -118.31,
  name: "Burbank, CA",
  timezone: "America/Los_Angeles",
};

function mockTracking(
  overrides: Partial<ReturnType<typeof useLiveSatelliteTracking>>,
) {
  vi.mocked(useLiveSatelliteTracking).mockReturnValue({
    phase: "upcoming",
    nowSec: 1_700_000_000,
    positions: null,
    current: null,
    estimate: null,
    liveAz: 270,
    liveEl: 60,
    isEstimating: false,
    fetchError: null,
    ...overrides,
  });
}

beforeEach(() => {
  vi.mocked(useAstroStore).mockReturnValue({ selectedPass: pass, location });
  vi.mocked(useDeviceOrientation).mockReturnValue({
    permission: "prompt-needed",
    heading: null,
    requestAccess: vi.fn(),
  });
  groundTrackSource.setData.mockClear();
});

describe("SatelliteMapCompass", () => {
  it("prompts to select a pass when none is selected", () => {
    vi.mocked(useAstroStore).mockReturnValue({
      selectedPass: null,
      location,
    });
    mockTracking({ phase: "no-pass" });

    render(<SatelliteMapCompass />);

    expect(screen.getByText(/select a pass/i)).toBeInTheDocument();
  });

  it("shows a countdown and rise/peak/duration for an upcoming pass", () => {
    mockTracking({ phase: "upcoming" });

    render(<SatelliteMapCompass />);

    expect(screen.getByText(/next pass/i)).toBeInTheDocument();
    expect(screen.getByText(/rise/i)).toBeInTheDocument();
    expect(screen.getByText(/peak/i)).toBeInTheDocument();
  });

  it("shows an ended message once the pass is over", () => {
    mockTracking({ phase: "ended" });

    render(<SatelliteMapCompass />);

    expect(screen.getByText(/this pass has ended/i)).toBeInTheDocument();
  });

  it("gates the map + compass behind an Enable compass button pre-permission", () => {
    mockTracking({ phase: "active" });

    render(<SatelliteMapCompass />);

    expect(
      screen.getByRole("button", { name: /enable compass/i }),
    ).toBeInTheDocument();
  });

  it("draws the full rise-to-set trajectory, not just the elapsed trail", () => {
    // One sample before rise, one after set — both real orbit points N2YO
    // can include in the batch, but outside what "rise to fall" means here
    // — plus the visible arc itself. `current` sits partway through, so a
    // trail-only filter would wrongly stop the line there.
    const positions: SatellitePosition[] = [
      { azimuth: 190, elevation: -2, satlatitude: 10, satlongitude: 10, sataltitude: 400, timestamp: pass.startUTC - 10 },
      { azimuth: 200, elevation: 10, satlatitude: 20, satlongitude: 20, sataltitude: 400, timestamp: pass.startUTC },
      { azimuth: 270, elevation: 60, satlatitude: 30, satlongitude: 30, sataltitude: 400, timestamp: pass.maxUTC },
      { azimuth: 10, elevation: 10, satlatitude: 40, satlongitude: 40, sataltitude: 400, timestamp: pass.endUTC },
      { azimuth: 5, elevation: -3, satlatitude: 50, satlongitude: 50, sataltitude: 400, timestamp: pass.endUTC + 10 },
    ];
    const current = positions[1]; // partway through the visible arc

    mockTracking({ phase: "active", positions, current });

    render(<SatelliteMapCompass />);

    expect(groundTrackSource.setData).toHaveBeenCalledWith(
      expect.objectContaining({
        geometry: {
          type: "LineString",
          coordinates: [
            [20, 20],
            [30, 30],
            [40, 40],
          ],
        },
      }),
    );
  });

  it("falls back to numeric az/el when compass permission is denied", () => {
    vi.mocked(useDeviceOrientation).mockReturnValue({
      permission: "denied",
      heading: null,
      requestAccess: vi.fn(),
    });
    mockTracking({ phase: "active", liveAz: 270, liveEl: 60 });

    render(<SatelliteMapCompass />);

    expect(screen.getByText(/compass access was denied/i)).toBeInTheDocument();
  });
});
