import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SatelliteMapCompass from "@/app/dashboard/sky-planner/_components/SatelliteMapCompass";
import { useAstroStore } from "@/stores/astrowatch";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useLiveSatelliteTracking } from "@/hooks/useLiveSatelliteTracking";
import { buildPassTrajectory } from "@/lib/groundTrack";
import type { Location, SatellitePass } from "@/types";

// Exposed so tests can assert what the map was actually told to draw,
// without reaching into the (mocked) maplibre-gl internals.
const addSourceMock = vi.fn();
const popupSetTextMock = vi.fn().mockReturnThis();
const groundTrackSource = { setData: vi.fn() };

// MapLibre needs a real WebGL canvas that jsdom can't provide. It's only
// ever exercised once phase === "active" (LiveMap mounts), but these
// chainable-builder mocks let that mount happen harmlessly so the tests can
// focus on this component's own render logic (permission gating, copy).
// `on` invokes the "load" callback synchronously (real MapLibre does so
// asynchronously) so the static trajectory/markers set up inside it are
// actually exercised in tests.
vi.mock("maplibre-gl", () => {
  class FakeMap {
    on = vi.fn((event: string, cb: () => void) => {
      if (event === "load") cb();
    });
    addSource = addSourceMock;
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
    setText = popupSetTextMock;
  }
  class FakeLngLatBounds {
    extend = vi.fn().mockReturnThis();
  }
  return {
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
    LngLatBounds: FakeLngLatBounds,
    setWorkerUrl: vi.fn(),
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
  addSourceMock.mockClear();
  popupSetTextMock.mockClear();
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

  it("toggles the compass card open/closed without affecting the map badges", () => {
    mockTracking({ phase: "active" });

    render(<SatelliteMapCompass />);

    // open by default
    expect(
      screen.getByRole("button", { name: /enable compass/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Hide compass"));
    expect(
      screen.queryByRole("button", { name: /enable compass/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/active now/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Show compass"));
    expect(
      screen.getByRole("button", { name: /enable compass/i }),
    ).toBeInTheDocument();
  });

  it("draws the trajectory from the pass's own az/el geometry, independent of live data", () => {
    const expectedCoordinates = buildPassTrajectory(pass, location).map(
      (p) => [p.lng, p.lat],
    );

    mockTracking({ phase: "active", current: null });
    const { unmount } = render(<SatelliteMapCompass />);
    expect(addSourceMock).toHaveBeenCalledWith(
      "ground-track",
      expect.objectContaining({
        data: expect.objectContaining({
          geometry: { type: "LineString", coordinates: expectedCoordinates },
        }),
      }),
    );
    unmount();

    // Simulate a remount with a live sample far from the drawn path (as if
    // real time had moved on) — the trajectory must be identical, since it
    // was never derived from `current` in the first place.
    addSourceMock.mockClear();
    mockTracking({
      phase: "active",
      current: {
        azimuth: 999,
        elevation: 999,
        satlatitude: -60,
        satlongitude: 170,
        sataltitude: 400,
        timestamp: pass.maxUTC,
      },
    });
    render(<SatelliteMapCompass />);
    expect(addSourceMock).toHaveBeenCalledWith(
      "ground-track",
      expect.objectContaining({
        data: expect.objectContaining({
          geometry: { type: "LineString", coordinates: expectedCoordinates },
        }),
      }),
    );
  });

  it("labels the map markers Start Pass / Max El / End Pass / You", () => {
    mockTracking({ phase: "active" });

    render(<SatelliteMapCompass />);

    const labels = popupSetTextMock.mock.calls.map((call) => call[0]);
    expect(labels).toEqual(
      expect.arrayContaining(["You", "Start Pass", "Max El", "End Pass"]),
    );
  });

  it("keeps the Preview map button reachable even when a real pass is already selected", () => {
    // PassList auto-selects the best real pass as soon as it loads, so
    // gating the preview button on "nothing selected" would make it
    // unreachable in practice almost all the time — it must show up
    // alongside a real selected pass too.
    mockTracking({ phase: "upcoming" });

    render(<SatelliteMapCompass />);

    expect(
      screen.getByRole("button", { name: /preview map \(test\)/i }),
    ).toBeInTheDocument();
  });

  it("falls back to numeric az/el when compass permission is denied", () => {
    vi.mocked(useDeviceOrientation).mockReturnValue({
      permission: "denied",
      heading: null,
      requestAccess: vi.fn(),
    });
    mockTracking({ phase: "active", liveAz: 270, liveEl: 60 });

    render(<SatelliteMapCompass />);

    expect(screen.getByText(/compass denied/i)).toBeInTheDocument();
  });
});
