import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { renderHook } from "@testing-library/react";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";

// Dispatches a plain "deviceorientation" event carrying just `alpha`, the
// same shape a flat-formula browser (no webkitCompassHeading) delivers.
function dispatchOrientation(alpha: number) {
  const event = new Event("deviceorientation");
  Object.defineProperty(event, "alpha", { value: alpha, configurable: true });
  window.dispatchEvent(event);
}

describe("useDeviceOrientation", () => {
  let now = 1000;

  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    // Feature-detect as Android/desktop-with-sensors: no iOS-style
    // requestPermission gate, so the hook attaches immediately on mount.
    // No "deviceorientationabsolute" support either, so it listens for
    // plain "deviceorientation" — the event this test dispatches.
    // @ts-expect-error minimal stub, not a real DeviceOrientationEvent ctor
    window.DeviceOrientationEvent = function () {};
    if ("ondeviceorientationabsolute" in window) {
      // @ts-expect-error test cleanup of a property jsdom doesn't define
      delete window.ondeviceorientationabsolute;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches immediately and turns the first reading straight into a heading", () => {
    const { result } = renderHook(() => useDeviceOrientation());
    expect(result.current.permission).toBe("granted");

    act(() => dispatchOrientation(90)); // heading = (360 - 90) % 360 = 270
    expect(result.current.heading).toBe(270);
  });

  it("smooths an ordinary small change instead of snapping to it", () => {
    const { result } = renderHook(() => useDeviceOrientation());
    act(() => dispatchOrientation(90));
    expect(result.current.heading).toBe(270);

    now += 200;
    act(() => dispatchOrientation(92)); // heading = 268, a plausible 2° drift
    expect(result.current.heading).toBeCloseTo(269.76, 5);
  });

  it("ignores a single implausible jump instead of swinging the displayed heading toward it", () => {
    const { result } = renderHook(() => useDeviceOrientation());
    act(() => dispatchOrientation(90));
    expect(result.current.heading).toBe(270);

    now += 200;
    // alpha=260 -> heading=100, a ~170° single-tick swing — no hand can
    // rotate a phone that far between two native sensor samples.
    act(() => dispatchOrientation(260));
    expect(result.current.heading).toBe(270);

    now += 200;
    // A normal reading resumes right after — confirms the jump wasn't
    // real device motion, just a one-off glitch.
    act(() => dispatchOrientation(90));
    expect(result.current.heading).toBe(270);
  });

  it("eventually accepts a jump that keeps recurring, instead of freezing forever", () => {
    const { result } = renderHook(() => useDeviceOrientation());
    act(() => dispatchOrientation(90));
    expect(result.current.heading).toBe(270);

    // The same ~170° swing as above, but it keeps showing up across
    // several native ticks spanning >500ms — a real fast turn (or events
    // resuming after the tab was backgrounded), not a glitch.
    for (let i = 0; i < 5; i++) {
      now += 150;
      act(() => dispatchOrientation(260));
    }
    expect(result.current.heading).not.toBe(270);
  });
});
