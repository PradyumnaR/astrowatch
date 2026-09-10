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

// A genuine sensor glitch — a magnetometer reading briefly thrown off by
// nearby magnetic interference (the phone's own speaker/vibration motor,
// a metal object), or the device's own orientation-fusion algorithm
// passing through a numerically unstable pose — tends to show up as a
// single native-tick delta far larger than a hand can plausibly rotate a
// phone between two sensor samples (these fire every ~16-33ms). That's
// what produces "holds still, then instantly swings ~180°, then settles
// back": SMOOTHING is a low-pass filter, good at averaging out ordinary
// per-sample jitter, but a *sustained* bad reading arriving at native tick
// rate overwhelms its exponential average within a couple hundred
// milliseconds — not the several seconds its smoothing factor alone would
// suggest — because it keeps reapplying the same wrong pull every tick.
// Reject an implausible single-tick jump outright rather than blending it
// in, unless it keeps recurring for a while — at that point it's more
// likely a real fast device rotation (or events resuming after a gap,
// e.g. the tab having been backgrounded) than a glitch, so let it through
// rather than getting stuck ignoring real motion forever.
const MAX_TICK_JUMP_DEG = 40;
const SUSTAINED_JUMP_MS = 500;

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
  const lastAcceptedRawRef = useRef<number | null>(null);
  const jumpStreakStartRef = useRef<number | null>(null);

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

    const now = performance.now();

    // Reject an implausible single-tick jump (see MAX_TICK_JUMP_DEG above)
    // rather than smoothing it in, unless it keeps showing up for a while —
    // then it's more likely real than a glitch.
    if (lastAcceptedRawRef.current !== null) {
      const jump = Math.abs(
        ((raw - lastAcceptedRawRef.current + 540) % 360) - 180,
      );
      if (jump > MAX_TICK_JUMP_DEG) {
        if (jumpStreakStartRef.current === null) {
          jumpStreakStartRef.current = now;
        }
        if (now - jumpStreakStartRef.current < SUSTAINED_JUMP_MS) {
          return; // drop this sample — likely a glitch, not real motion
        }
        // Kept jumping for SUSTAINED_JUMP_MS straight — accept it below.
      } else {
        jumpStreakStartRef.current = null;
      }
    }
    lastAcceptedRawRef.current = raw;

    // Smooth on every accepted event so the filter stays accurate at
    // native sensor rate, but only emit to React state (and trigger a
    // render) a few times a second — plenty fluid alongside the arrow's
    // own CSS transition, and far cheaper than re-rendering on every
    // sensor tick.
    const smoothed = smoothAngle(smoothedHeadingRef.current, raw);
    smoothedHeadingRef.current = smoothed;

    if (now - lastEmitRef.current < EMIT_INTERVAL_MS) return;
    lastEmitRef.current = now;
    setHeading(smoothed);
  }, []);

  const attach = useCallback(() => {
    if (attachedRef.current) return;
    attachedRef.current = true;
    // Exactly one of these two listeners, never both: "deviceorientation"'s
    // `alpha` is only guaranteed relative to whatever orientation the device
    // happened to be in when it started firing (drifts further, and can
    // rebase to a new arbitrary zero point, e.g. across a tab/visibility
    // change) — that's true north only as a same-origin fallback for
    // browsers that don't support the absolute event at all. Browsers that
    // fire "deviceorientationabsolute" give real true-north headings there
    // instead, so it takes over exclusively. Registering both used to feed
    // both a real absolute reading and a drifting relative one into the same
    // smoothing filter, corrupting the blended heading (symptom: an
    // apparently-fine heading that quietly drifts, or jumps to a new stable
    // — but wrong — value after backgrounding the tab). iOS never fires
    // "deviceorientationabsolute" at all, so it always falls into the
    // "deviceorientation" branch below and gets its true heading from
    // `webkitCompassHeading` instead (see handleEvent).
    const supportsAbsolute = "ondeviceorientationabsolute" in window;
    if (supportsAbsolute) {
      window.addEventListener(
        "deviceorientationabsolute",
        handleEvent as EventListener,
      );
    } else {
      window.addEventListener("deviceorientation", handleEvent);
    }
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
