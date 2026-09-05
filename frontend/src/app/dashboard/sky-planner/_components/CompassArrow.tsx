"use client";

import { useEffect, useRef, useState } from "react";

// Rotating compass needle, isolated in its own component so its rotation-
// unwrapping state/effect can run unconditionally (needed for hooks rules)
// without complicating the parent's own early-return logic — this only
// ever mounts while a compass heading is actually available.
export default function CompassArrow({
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
