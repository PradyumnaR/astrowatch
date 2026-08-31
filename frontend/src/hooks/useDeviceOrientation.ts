"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type OrientationPermission =
  | "unknown"
  | "unsupported"
  | "prompt-needed"
  | "granted"
  | "denied";

// iOS Safari puts a non-standard, already-true-north compass reading here.
interface IOSDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

// iOS 13+ gates DeviceOrientationEvent behind a user-gesture permission call
// that doesn't exist on Android/desktop — feature-detect it.
interface RequestableDeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

// Raw magnetometer readings jitter by several degrees even when the phone
// is held still, and orientation events can fire 30-60+ times/sec — pushing
// every raw reading straight into state makes the arrow visibly flicker.
// SMOOTHING blends each new reading toward the previous one (exponential
// moving average) instead of snapping to it; EMIT_INTERVAL_MS caps how
// often that smoothed value actually triggers a re-render. EMIT_INTERVAL_MS
// is kept equal to the arrow's own CSS transition duration (see
// RealtimePointer.tsx's CompassArrow) so each transition finishes before
// the next update arrives, instead of being interrupted mid-flight.
const SMOOTHING = 0.12;
const EMIT_INTERVAL_MS = 150;

// Circular-safe exponential smoothing — averaging angles directly (e.g.
// naively averaging 359° and 1° as (359+1)/2 = 180°) is wrong because the
// values wrap; this blends along the shortest path around the circle.
function smoothAngle(prev: number | null, next: number): number {
  if (prev === null) return next;
  const delta = ((next - prev + 540) % 360) - 180; // shortest signed diff
  return (prev + delta * SMOOTHING + 360) % 360;
}

/**
 * Live compass heading (0–360°, 0 = N, clockwise) from the device's
 * orientation sensor, with iOS's gesture-gated permission flow handled.
 *
 * Known limitation: on browsers that only fire the non-absolute
 * "deviceorientation" event (no webkitCompassHeading, no
 * deviceorientationabsolute support), `alpha` is relative to the device's
 * initial orientation, not guaranteed true north.
 */
export function useDeviceOrientation() {
  const [permission, setPermission] =
    useState<OrientationPermission>("unknown");
  const [heading, setHeading] = useState<number | null>(null);
  const attachedRef = useRef(false);
  const smoothedHeadingRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);

  const handleEvent = useCallback((event: DeviceOrientationEvent) => {
    const webkitHeading = (event as IOSDeviceOrientationEvent)
      .webkitCompassHeading;
    let raw: number | null = null;
    if (typeof webkitHeading === "number" && !Number.isNaN(webkitHeading)) {
      raw = webkitHeading;
    } else if (typeof event.alpha === "number") {
      raw = (360 - event.alpha) % 360;
    }
    if (raw === null) return;

    // Smooth on every event so the filter stays accurate at native sensor
    // rate, but only emit to React state (and trigger a render) a few
    // times a second — plenty fluid alongside the arrow's own CSS
    // transition, and far cheaper than re-rendering on every sensor tick.
    const smoothed = smoothAngle(smoothedHeadingRef.current, raw);
    smoothedHeadingRef.current = smoothed;

    const now = performance.now();
    if (now - lastEmitRef.current < EMIT_INTERVAL_MS) return;
    lastEmitRef.current = now;
    setHeading(smoothed);
  }, []);

  const attach = useCallback(() => {
    if (attachedRef.current) return;
    attachedRef.current = true;
    if ("ondeviceorientationabsolute" in window) {
      window.addEventListener(
        "deviceorientationabsolute",
        handleEvent as EventListener,
      );
    }
    window.addEventListener("deviceorientation", handleEvent);
  }, [handleEvent]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof DeviceOrientationEvent === "undefined"
    ) {
      setPermission("unsupported");
      return;
    }

    const requestable =
      DeviceOrientationEvent as unknown as RequestableDeviceOrientationEvent;
    if (typeof requestable.requestPermission === "function") {
      setPermission("prompt-needed"); // iOS 13+ — wait for a button tap
    } else {
      setPermission("granted"); // Android / desktop-with-sensors — no gate
      attach();
    }

    return () => {
      window.removeEventListener(
        "deviceorientationabsolute",
        handleEvent as EventListener,
      );
      window.removeEventListener("deviceorientation", handleEvent);
      attachedRef.current = false;
    };
  }, [attach, handleEvent]);

  // Must be invoked directly from a click handler — no async gap before the
  // requestPermission() call — or iOS silently rejects it.
  const requestAccess = useCallback(async () => {
    const requestable =
      DeviceOrientationEvent as unknown as RequestableDeviceOrientationEvent;
    if (typeof requestable.requestPermission !== "function") {
      setPermission("granted");
      attach();
      return;
    }
    try {
      const result = await requestable.requestPermission();
      if (result === "granted") {
        setPermission("granted");
        attach();
      } else {
        setPermission("denied");
      }
    } catch (err) {
      console.error("DeviceOrientation permission request failed:", err);
      setPermission("denied");
    }
  }, [attach]);

  return { permission, heading, requestAccess };
}
