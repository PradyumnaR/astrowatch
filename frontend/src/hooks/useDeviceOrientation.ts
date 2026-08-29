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

  const handleEvent = useCallback((event: DeviceOrientationEvent) => {
    const webkitHeading = (event as IOSDeviceOrientationEvent)
      .webkitCompassHeading;
    if (typeof webkitHeading === "number" && !Number.isNaN(webkitHeading)) {
      setHeading(webkitHeading);
      return;
    }
    if (typeof event.alpha === "number") {
      setHeading((360 - event.alpha) % 360);
    }
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
