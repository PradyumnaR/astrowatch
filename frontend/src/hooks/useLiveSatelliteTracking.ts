"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Location, SatellitePass, SatellitePosition } from "@/types";

// N2YO hard-caps a single /positions request to 300s of samples.
const MAX_SECONDS = 300;
// re-fetch once the loaded window is this close to running out
const REFETCH_MARGIN_SEC = 15;

export type Phase = "no-pass" | "upcoming" | "active" | "ended";

export function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

// rough az/el estimate across the pass's 3 known summary points, used only
// as a placeholder for the few seconds before the first live fetch lands
export function estimatePosition(pass: SatellitePass, nowSec: number) {
  const { startUTC, maxUTC, endUTC, startAz, maxAz, endAz, startEl, maxEl } =
    pass;
  if (nowSec <= maxUTC) {
    const span = Math.max(maxUTC - startUTC, 1);
    const t = Math.min(Math.max((nowSec - startUTC) / span, 0), 1);
    return {
      azimuth: lerpAngle(startAz, maxAz, t),
      elevation: startEl + (maxEl - startEl) * t,
    };
  }
  const span = Math.max(endUTC - maxUTC, 1);
  const t = Math.min(Math.max((nowSec - maxUTC) / span, 0), 1);
  return { azimuth: lerpAngle(maxAz, endAz, t), elevation: maxEl * (1 - t) };
}

/**
 * Tracks a selected pass against wall-clock time and polls `/api/positions`
 * for live az/el/lat/lon while the pass is upcoming (within the 300s
 * pre-window) through active. Behavior-preserving extraction of the logic
 * that used to live inline in RealtimePointer.tsx, so it can be shared by
 * both the compass overlay and the map.
 */
export function useLiveSatelliteTracking(
  selectedPass: SatellitePass | null,
  location: Location | null,
) {
  const [positions, setPositions] = useState<SatellitePosition[] | null>(
    null,
  );
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const isFetchingRef = useRef(false);

  // 1Hz ticker — always reads a fresh Date.now(), not an incrementing
  // counter, so it self-corrects for any browser timer throttling.
  useEffect(() => {
    const id = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  // Reset fetched positions whenever the selected pass changes. Done during
  // render (React's "adjust state in response to a prop change" pattern)
  // rather than in an effect, to avoid an extra render and the
  // set-state-in-effect lint rule.
  const passKey = selectedPass
    ? `${selectedPass.satid}-${selectedPass.startUTC}`
    : null;
  const [prevPassKey, setPrevPassKey] = useState(passKey);
  if (passKey !== prevPassKey) {
    setPrevPassKey(passKey);
    setPositions(null);
    setFetchError(null);
  }

  const phase: Phase = !selectedPass
    ? "no-pass"
    : nowSec < selectedPass.startUTC
      ? "upcoming"
      : nowSec <= selectedPass.endUTC
        ? "active"
        : "ended";

  // Fetch trigger — only inside the 300s pre-window through the active
  // window. A pass more than 5 minutes out, or already ended, never
  // triggers a request. The fetch itself is a nested function declared
  // inside the effect (matches PassList.tsx's existing convention in this
  // codebase) rather than a component-level function invoked
  // fire-and-forget from the effect.
  useEffect(() => {
    if (!selectedPass || !location) return;
    if (phase === "ended" || phase === "no-pass") return;
    if (isFetchingRef.current) return;

    const withinPreWindow = selectedPass.startUTC - nowSec <= MAX_SECONDS;
    const windowStart = positions?.[0]?.timestamp;
    const nearEdge =
      positions != null &&
      windowStart !== undefined &&
      positions.length - (nowSec - windowStart) <= REFETCH_MARGIN_SEC;

    if (!((!positions && withinPreWindow) || nearEdge)) return;

    async function fetchPositions() {
      isFetchingRef.current = true;
      try {
        const secondsRemaining = Math.max(
          selectedPass!.endUTC - Math.floor(Date.now() / 1000),
          60,
        );
        const seconds = Math.min(MAX_SECONDS, secondsRemaining);
        const res = await fetch(
          `/api/positions?id=${selectedPass!.satid}&lat=${location!.lat}&lng=${location!.lng}&seconds=${seconds}`,
        );
        const data = await res.json();
        if (data.positions?.length) {
          setPositions(data.positions);
          setFetchError(null);
        } else {
          setFetchError("No live position data available right now.");
        }
      } catch (err) {
        console.error("Failed to fetch satellite positions:", err);
        setFetchError("Couldn't load live position. Retrying shortly.");
      } finally {
        isFetchingRef.current = false;
      }
    }

    fetchPositions();
  }, [nowSec, selectedPass, location, positions, phase]);

  const current = useMemo(() => {
    if (!positions?.length) return null;
    const windowStart = positions[0].timestamp;
    const idx = Math.min(
      Math.max(nowSec - windowStart, 0),
      positions.length - 1,
    );
    return positions[idx];
  }, [positions, nowSec]);

  const isEstimating = phase === "active" && !current;
  const estimate =
    selectedPass && phase === "active" && !current
      ? estimatePosition(selectedPass, nowSec)
      : null;
  const liveAz =
    current?.azimuth ?? estimate?.azimuth ?? selectedPass?.maxAz ?? 0;
  const liveEl =
    current?.elevation ?? estimate?.elevation ?? selectedPass?.maxEl ?? 0;

  return {
    phase,
    nowSec,
    positions,
    current,
    estimate,
    liveAz,
    liveEl,
    isEstimating,
    fetchError,
  };
}
