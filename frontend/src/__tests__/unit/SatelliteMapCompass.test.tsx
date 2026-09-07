import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SatelliteMapCompass, {
  buildPreviewScenario,
} from "@/app/dashboard/sky-planner/_components/SatelliteMapCompass";
import { useAstroStore } from "@/stores/astrowatch";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useLiveSatelliteTracking } from "@/hooks/useLiveSatelliteTracking";
import type { Location, SatellitePass } from "@/types";

// Exposed so tests can assert what markers/popups the map was actually told
// to draw, without reaching into the (mocked) maplibre-gl internals.
const setLngLatMock = vi.fn().mockReturnThis();
const popupSetTextMock = vi.fn().mockReturnThis();

// MapLibre needs a real WebGL canvas that jsdom can't provide. It's only
// ever exercised once phase === "active" (LiveMap mounts) — these
// chainable-builder mocks let that mount happen harmlessly so the tests can
// focus on this component's own render logic (permission gating, copy).
vi.mock("maplibre-gl", () => {
  class FakeMap {
    on = vi.fn();
    remove = vi.fn();
  }
  class FakeMarker {
    setLngLat = setLngLatMock;
    setPopup = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
  }
  class FakePopup {
    setText = popupSetTextMock;
  }
  return {
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
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
  setLngLatMock.mockClear();
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

  it("places the observer marker at the user's location, labeled You", () => {
    mockTracking({ phase: "active", current: null });

    render(<SatelliteMapCompass />);

    expect(setLngLatMock).toHaveBeenCalledWith([location.lng, location.lat]);
    expect(popupSetTextMock).toHaveBeenCalledWith("You");
  });

  it("moves the live satellite marker to each new /api/positions fix", () => {
    mockTracking({
      phase: "active",
      current: {
        azimuth: 270,
        elevation: 60,
        satlatitude: 40,
        satlongitude: -100,
        sataltitude: 408,
        timestamp: pass.maxUTC,
      },
    });

    render(<SatelliteMapCompass />);

    expect(setLngLatMock).toHaveBeenCalledWith([-100, 40]);
  });

  it("keeps the Preview map button reachable even when a real pass is already selected", () => {
    // PassList auto-selects the best real pass as soon as it loads, so
    // gating the preview button on "nothing selected" would make it
    // unreachable in practice almost all the time — it must show up
    // alongside a real selected pass too.
    mockTracking({ phase: "upcoming" });

    render(<SatelliteMapCompass />);

    expect(
      screen.getByRole("button", { name: /preview map/i }),
    ).toBeInTheDocument();
  });

  it("builds a preview scenario with positions spanning the fabricated pass", () => {
    const { pass: previewPass, positions } = buildPreviewScenario(location);

    expect(positions.length).toBeGreaterThan(0);
    expect(positions[0].timestamp).toBe(previewPass.startUTC);
    expect(positions[positions.length - 1].timestamp).toBe(
      previewPass.endUTC,
    );
    // sweeps a few degrees either side of the observer — not exact, just
    // close enough to see the map and marker move during preview
    for (const position of positions) {
      expect(Math.abs(position.satlatitude - location.lat)).toBeLessThan(3);
      expect(Math.abs(position.satlongitude - location.lng)).toBeLessThan(4);
    }
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
