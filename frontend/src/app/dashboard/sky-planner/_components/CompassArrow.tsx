"use client";

import { useEffect, useRef, useState } from "react";

// "Facing satellite" flips on at this margin but only flips back off past a
// wider one — plain sensor noise on the heading (a couple of degrees even
// when the phone is held still) would otherwise sit right on a single
// threshold and toggle the status text back and forth many times a second.
const FACING_ENTER_DEG = 5;
const FACING_EXIT_DEG = 9;

// Rotating compass needle, isolated in its own component so its rotation-
// unwrapping state/effect can run unconditionally (needed for hooks rules)
// without complicating the parent's own early-return logic — this only
// ever mounts while a compass heading is actually available.
export default function CompassArrow({
  targetAz,
  heading,
  size = 150,
}: {
  targetAz: number;
  heading: number;
  size?: number;
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

  // Hysteresis for the status text, adjusted during render (same
  // React-sanctioned "derive state from a prop change" pattern used
  // elsewhere in this codebase, e.g. useLiveSatelliteTracking's passKey
  // reset) rather than in an effect — no need for the extra render/paint
  // an effect would cost here.
  const [isFacing, setIsFacing] = useState(Math.abs(turnDiff) < FACING_ENTER_DEG);
  const wantFacing = isFacing
    ? Math.abs(turnDiff) < FACING_EXIT_DEG
    : Math.abs(turnDiff) < FACING_ENTER_DEG;
  if (wantFacing !== isFacing) setIsFacing(wantFacing);

  return (
    <>
      <div className="relative" style={{ width: size, height: size }}>
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
      {/* Fixed width (sized for the longest string, "Turn 180° left") so
          swapping between "Facing satellite ✓" and "Turn N° left/right"
          never reflows the card around it. */}
      <div className="text-[12px] font-medium text-aw-text-sec text-center w-[112px]">
        {isFacing ? (
          <span className="text-aw-teal">Facing satellite ✓</span>
        ) : (
          `Turn ${Math.round(Math.abs(turnDiff))}° ${turnDiff > 0 ? "right" : "left"}`
        )}
      </div>
    </>
  );
}
