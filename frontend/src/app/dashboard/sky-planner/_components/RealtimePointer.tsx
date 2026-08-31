"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { azToCompass } from "@/lib/compass";
import type { SatellitePass, SatellitePosition } from "@/types";

// N2YO hard-caps a single /positions request to 300s of samples.
const MAX_SECONDS = 300;
// re-fetch once the loaded window is this close to running out
const REFETCH_MARGIN_SEC = 15;

type Phase = "no-pass" | "upcoming" | "active" | "ended";

function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

// rough az/el estimate across the pass's 3 known summary points, used only
// as a placeholder for the few seconds before the first live fetch lands
function estimatePosition(pass: SatellitePass, nowSec: number) {
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

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

// Rotating compass needle, isolated in its own component so its rotation-
// unwrapping state/effect can run unconditionally (needed for hooks rules)
// without complicating RealtimePointer's own early-return logic — this
// only ever mounts while a compass heading is actually available.
function CompassArrow({
  targetAz,
  heading,
}: {
  targetAz: number;
  heading: number;
}) {
  // wrapped into [0, 360) — on its own this would make the arrow spin
  // almost a full circle whenever a real change crosses the 359°→0° seam
  // (most visible right as you align with the satellite, since that's
  // exactly where rotation sits near 0°/360°).
  const rawRotation = (targetAz - heading + 360) % 360;
  const turnDiff = ((targetAz - heading + 540) % 360) - 180;

  // Unwrapped, continuous rotation used for the actual CSS transform —
  // tracked across renders via a ref (safe here: only read/written inside
  // an effect, never during render) so the arrow always takes the short
  // path instead of snapping across the seam.
  const [displayRotation, setDisplayRotation] = useState(rawRotation);
  const prevRawRef = useRef(rawRotation);
  const unwrappedRef = useRef(rawRotation);

  useEffect(() => {
    const delta = ((rawRotation - prevRawRef.current + 540) % 360) - 180;
    unwrappedRef.current += delta;
    prevRawRef.current = rawRotation;
    setDisplayRotation(unwrappedRef.current);
  }, [rawRotation]);

  return (
    <>
      <div className="relative w-[150px] h-[150px]">
        <div className="absolute inset-0 rounded-full border border-aw-border bg-aw-tint" />
        <div
          className="absolute inset-0 transition-transform duration-150 ease-linear"
          style={{ transform: `rotate(${displayRotation}deg)` }}
        >
          <svg viewBox="0 0 150 150" className="w-full h-full">
            <path d="M75 18 L85 82 L75 70 L65 82 Z" fill="#7c6ff7" />
          </svg>
        </div>
        <div className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full bg-aw-text -translate-x-1/2 -translate-y-1/2 ring-4 ring-aw-bg" />
      </div>
      <div className="text-[12px] font-medium text-aw-text-sec">
        {Math.abs(turnDiff) < 5 ? (
          <span className="text-aw-teal">Facing satellite ✓</span>
        ) : (
          `Turn ${Math.round(Math.abs(turnDiff))}° ${turnDiff > 0 ? "right" : "left"}`
        )}
      </div>
    </>
  );
}

export default function RealtimePointer() {
  const { selectedPass, location } = useAstroStore();
  const { permission, heading, requestAccess } = useDeviceOrientation();

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
  // window, and only while this component is mounted (it's only rendered
  // at all when the "Point to Satellite" tab is selected). A pass more
  // than 5 minutes out, or already ended, never triggers a request. The
  // fetch itself is a nested function declared inside the effect (matches
  // PassList.tsx's existing convention in this codebase) rather than a
  // component-level function invoked fire-and-forget from the effect.
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

  if (!selectedPass) {
    return (
      <div className="relative w-full rounded-xl overflow-hidden border border-aw-border bg-aw-bg min-h-[250px] flex items-center justify-center">
        <p className="text-aw-text-muted text-xs">
          Select a pass from the left panel
        </p>
      </div>
    );
  }

  const isEstimating = phase === "active" && !current;
  const estimate =
    phase === "active" && !current
      ? estimatePosition(selectedPass, nowSec)
      : null;
  const liveAz = current?.azimuth ?? estimate?.azimuth ?? selectedPass.maxAz;
  const liveEl =
    current?.elevation ?? estimate?.elevation ?? selectedPass.maxEl;

  const hasCompass = permission === "granted" && heading !== null;

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-aw-border bg-aw-bg min-h-[250px] flex flex-col items-center justify-center gap-3 py-7 px-5 text-center">
      <span className="text-[10px] font-semibold tracking-wider uppercase text-aw-text-muted">
        {selectedPass.satname} ·{" "}
        {phase === "upcoming"
          ? "Next pass"
          : phase === "ended"
            ? "Pass ended"
            : "Active now"}
      </span>

      {phase === "upcoming" && (
        <>
          <div className="text-4xl font-semibold text-aw-purple tabular-nums">
            {formatCountdown(selectedPass.startUTC - nowSec)}
          </div>
          <div className="flex gap-5 text-[12px] text-aw-text-sec tabular-nums">
            <span>
              Rise{" "}
              <b className="text-aw-text font-semibold">
                {selectedPass.startAzCompass} · {selectedPass.startEl}°
              </b>
            </span>
            <span>
              Peak{" "}
              <b className="text-aw-text font-semibold">
                {selectedPass.maxEl}°
              </b>
            </span>
            <span>
              Duration{" "}
              <b className="text-aw-text font-semibold">
                {formatCountdown(selectedPass.duration)}
              </b>
            </span>
          </div>
          <p className="text-aw-text-muted text-[11px] max-w-[260px]">
            Live tracking starts automatically once the pass is within 5
            minutes.
          </p>
        </>
      )}

      {phase === "ended" && (
        <p className="text-aw-text-sec text-[13px]">This pass has ended.</p>
      )}

      {phase === "active" && permission === "prompt-needed" && (
        <>
          <button
            onClick={requestAccess}
            className="h-9 px-5 rounded-lg border border-aw-purple/45 bg-aw-purple/15 text-aw-purple text-[13px] font-medium hover:bg-aw-purple/25 transition-colors cursor-pointer"
          >
            Enable compass
          </button>
          <p className="text-aw-text-muted text-[11px] max-w-[260px]">
            Tap to allow AstroWatch to use your compass for live pointing.
            Android doesn&apos;t need this step.
          </p>
        </>
      )}

      {phase === "active" && permission !== "prompt-needed" && (
        <>
          {hasCompass ? (
            <CompassArrow targetAz={liveAz} heading={heading as number} />
          ) : (
            <>
              <div className="text-[26px] font-semibold tabular-nums">
                {Math.round(liveAz)}° ({azToCompass(liveAz)}),{" "}
                {Math.round(liveEl)}° up
              </div>
              <p className="text-aw-text-muted text-[11px] max-w-[260px]">
                {permission === "denied"
                  ? "Compass access was denied — showing numeric direction instead."
                  : "Compass unavailable — showing numeric direction instead."}
              </p>
            </>
          )}

          <div className="w-full max-w-[220px]">
            <div className="text-[28px] font-semibold text-aw-purple tabular-nums leading-none">
              {Math.round(liveEl)}°
            </div>
            <div className="text-[11px] text-aw-text-muted mt-0.5">
              {isEstimating ? "Look up (estimating…)" : "Look up"}
            </div>
            <div className="flex gap-1 mt-2.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full ${
                    i < Math.round(liveEl / 9)
                      ? "bg-aw-purple"
                      : "bg-aw-tint-hover"
                  }`}
                />
              ))}
            </div>
          </div>

          {fetchError && (
            <p className="text-aw-amber text-[11px]">{fetchError}</p>
          )}
        </>
      )}
    </div>
  );
}
