"use client";

import { useMemo } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import { SAT_COLORS, DEFAULT_COLOR } from "@/consts";

// ── constants ────────────────────────────────────────
const W = 680; // viewBox width
const H = 340; // viewBox height
const HORIZON_Y = 298; // y position of horizon line
const COMPASS_Y = 322; // y position of compass labels
const PEAK_MIN_Y = 40; // minimum y for 90° elevation

// compass directions evenly across width
const COMPASS = [
  { label: "N", x: 40, az: 0 },
  { label: "NE", x: 130, az: 45 },
  { label: "E", x: 220, az: 90 },
  { label: "SE", x: 310, az: 135 },
  { label: "S", x: 400, az: 180 },
  { label: "SW", x: 490, az: 225 },
  { label: "W", x: 580, az: 270 },
  { label: "NW", x: 650, az: 315 },
];

// ── helpers ──────────────────────────────────────────

// azimuth (0–360°) → SVG x coordinate
function azToX(az: number): number {
  return (az / 360) * W;
}

// elevation (0–90°) → SVG y coordinate
// 0° = horizon (HORIZON_Y), 90° = top (PEAK_MIN_Y)
function elToY(el: number): number {
  const ratio = el / 90;
  return HORIZON_Y - ratio * (HORIZON_Y - PEAK_MIN_Y);
}

// get color for a satellite name
function satColor(id: number): string {
  return SAT_COLORS[id] ?? DEFAULT_COLOR;
}

// check if a compass direction is on the pass path
function isOnPath(az: number, startAz: number, endAz: number): boolean {
  if (startAz < endAz) {
    return az >= startAz && az <= endAz;
  }
  // wraps around 360° (e.g. NW → NE going north)
  return az >= startAz || az <= endAz;
}

// ── star data (stable — no rerenders) ────────────────
const STARS = [
  // bright anchor stars
  { cx: 310, cy: 22, r: 1.6, op: 0.95, cls: "tw-a", fill: "#fffbe8" },
  { cx: 92, cy: 36, r: 1.4, op: 0.9, cls: "tw-b", fill: "#e8f4ff" },
  { cx: 602, cy: 28, r: 1.5, op: 0.9, cls: "tw-c", fill: "#fff5e8" },
  // medium stars
  { cx: 48, cy: 24, r: 1.1, op: 0.8, cls: "tw-a", fill: "white" },
  { cx: 155, cy: 18, r: 0.9, op: 0.7, cls: "tw-b", fill: "white" },
  { cx: 230, cy: 44, r: 1.0, op: 0.75, cls: "tw-c", fill: "white" },
  { cx: 190, cy: 78, r: 0.8, op: 0.6, cls: "tw-a", fill: "white" },
  { cx: 118, cy: 95, r: 0.7, op: 0.5, cls: "tw-b", fill: "white" },
  { cx: 268, cy: 30, r: 0.9, op: 0.65, cls: "tw-c", fill: "white" },
  { cx: 410, cy: 20, r: 1.1, op: 0.8, cls: "tw-a", fill: "white" },
  { cx: 458, cy: 58, r: 0.8, op: 0.55, cls: "tw-b", fill: "white" },
  { cx: 495, cy: 26, r: 1.0, op: 0.7, cls: "tw-c", fill: "white" },
  { cx: 540, cy: 44, r: 0.9, op: 0.6, cls: "tw-a", fill: "white" },
  { cx: 578, cy: 70, r: 0.7, op: 0.5, cls: "tw-b", fill: "white" },
  { cx: 648, cy: 32, r: 1.0, op: 0.75, cls: "tw-c", fill: "white" },
  { cx: 620, cy: 88, r: 0.8, op: 0.45, cls: "tw-a", fill: "white" },
  { cx: 350, cy: 55, r: 0.7, op: 0.4, cls: "tw-b", fill: "white" },
  { cx: 142, cy: 52, r: 0.6, op: 0.35, cls: "tw-c", fill: "white" },
  // faint background stars
  { cx: 70, cy: 140, r: 0.6, op: 0.3, cls: "tw-b", fill: "white" },
  { cx: 200, cy: 160, r: 0.6, op: 0.25, cls: "tw-c", fill: "white" },
  { cx: 480, cy: 120, r: 0.6, op: 0.3, cls: "tw-a", fill: "white" },
  { cx: 560, cy: 150, r: 0.6, op: 0.28, cls: "tw-b", fill: "white" },
  { cx: 38, cy: 180, r: 0.5, op: 0.2, cls: "tw-c", fill: "white" },
  { cx: 635, cy: 165, r: 0.5, op: 0.22, cls: "tw-a", fill: "white" },
  { cx: 505, cy: 90, r: 0.6, op: 0.3, cls: "tw-b", fill: "white" },
];

// ── component ─────────────────────────────────────────
export default function SkyCanvas() {
  const { selectedPass, location } = useAstroStore();

  // compute arc path from pass azimuth + elevation
  const arc = useMemo(() => {
    if (!selectedPass) return null;

    const x1 = azToX(selectedPass.startAz);
    const y1 = HORIZON_Y;
    const cx = azToX(selectedPass.maxAz);
    const cy = elToY(selectedPass.maxEl);
    const x2 = azToX(selectedPass.endAz);
    const y2 = HORIZON_Y;

    return {
      path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
      startX: x1,
      peakX: cx,
      peakY: cy,
      endX: x2,
      color: satColor(selectedPass.satid),
      // CSS offset-path needs the same path string
      offsetPath: `path('M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}')`,
    };
  }, [selectedPass]);

  const color = arc?.color ?? DEFAULT_COLOR;

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden
      border border-aw-border"
      style={{ background: "#06060f" }}
    >
      {/* ── CSS animations ── */}
      <style>{`
        @keyframes tw-a { 0%,100%{opacity:.9} 50%{opacity:.3}  }
        @keyframes tw-b { 0%,100%{opacity:.6} 50%{opacity:.15} }
        @keyframes tw-c { 0%,100%{opacity:.5} 33%{opacity:.95} 66%{opacity:.2} }
        @keyframes ring  { 0%{r:5;opacity:.7} 100%{r:18;opacity:0} }
        @keyframes glow  { 0%,100%{opacity:.12} 50%{opacity:.26} }
        @keyframes sat-move { 0%{offset-distance:0%} 100%{offset-distance:100%} }
        .tw-a { animation: tw-a 2.8s ease-in-out infinite }
        .tw-b { animation: tw-b 3.5s ease-in-out infinite }
        .tw-c { animation: tw-c 4.2s ease-in-out infinite }
        #sky-glow  { animation: glow 4s ease-in-out infinite }
        #pulse-ring{ animation: ring 2s ease-out infinite   }
        #sat-dot {
          offset-path: ${arc?.offsetPath ?? "none"};
          animation: sat-move 7s linear infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>

      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Sky canvas showing ${selectedPass?.satname ?? "satellite"} pass`}
      >
        <defs>
          {/* sky background gradient */}
          <radialGradient id="sky-bg" cx="50%" cy="55%" r="60%">
            <stop offset="0%" stopColor="#160e38" />
            <stop offset="100%" stopColor="#06060f" />
          </radialGradient>

          {/* purple ambient glow */}
          <radialGradient id="amb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7c6ff7" stopOpacity="1" />
            <stop offset="100%" stopColor="#7c6ff7" stopOpacity="0" />
          </radialGradient>

          {/* horizon atmospheric glow */}
          <linearGradient id="hz-glow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1a3a5c" stopOpacity="0" />
            <stop offset="50%" stopColor="#1a3a5c" stopOpacity=".35" />
            <stop offset="100%" stopColor="#1a3a5c" stopOpacity="0" />
          </linearGradient>

          {/* arc gradient — fades at ends */}
          <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity=".1" />
            <stop offset="40%" stopColor={color} stopOpacity=".95" />
            <stop offset="100%" stopColor={color} stopOpacity=".1" />
          </linearGradient>

          {/* clip stars to sky area only */}
          <clipPath id="sky-clip">
            <rect x="0" y="0" width={W} height={HORIZON_Y} />
          </clipPath>
        </defs>

        {/* ── sky background ── */}
        <rect x="0" y="0" width={W} height={H} fill="url(#sky-bg)" />

        {/* ambient purple glow */}
        <circle
          id="sky-glow"
          cx={W / 2}
          cy="160"
          r="140"
          fill="url(#amb-glow)"
          opacity=".15"
        />

        {/* atmospheric horizon glow */}
        <rect x="0" y="255" width={W} height="55" fill="url(#hz-glow)" />

        {/* ── stars ── */}
        <g clipPath="url(#sky-clip)">
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              fill={s.fill}
              opacity={s.op}
              className={s.cls}
            />
          ))}
        </g>

        {/* ── elevation guide lines ── */}
        <line
          x1="0"
          y1={elToY(30)}
          x2={W}
          y2={elToY(30)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth=".5"
          strokeDasharray="4 8"
        />
        <line
          x1="0"
          y1={elToY(60)}
          x2={W}
          y2={elToY(60)}
          stroke="rgba(255,255,255,0.03)"
          strokeWidth=".5"
          strokeDasharray="4 8"
        />

        {/* elevation labels */}
        <text
          x="12"
          y={elToY(30) + 4}
          fontSize="9"
          fill="rgba(255,255,255,0.18)"
          fontFamily="system-ui"
        >
          30°
        </text>
        <text
          x="12"
          y={elToY(60) + 4}
          fontSize="9"
          fill="rgba(255,255,255,0.14)"
          fontFamily="system-ui"
        >
          60°
        </text>

        {/* peak elevation label — only when pass selected */}
        {selectedPass && (
          <>
            <line
              x1="28"
              y1={arc!.peakY}
              x2="42"
              y2={arc!.peakY}
              stroke={`${color}80`}
              strokeWidth=".8"
            />
            <text
              x="12"
              y={arc!.peakY + 4}
              fontSize="9"
              fill={`${color}cc`}
              fontFamily="system-ui"
            >
              {selectedPass.maxEl}°
            </text>
          </>
        )}

        {/* ── horizon line ── */}
        <line
          x1="0"
          y1={HORIZON_Y}
          x2={W}
          y2={HORIZON_Y}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth=".8"
        />
        <rect
          x="0"
          y={HORIZON_Y}
          width={W}
          height={H - HORIZON_Y - 22}
          fill="rgba(0,0,0,0.4)"
        />

        {/* ── pass arc ── */}
        {arc && (
          <>
            {/* arc path */}
            <path
              fill="none"
              stroke="url(#arc-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              d={arc.path}
            />

            {/* start dot */}
            <circle
              cx={arc.startX}
              cy={HORIZON_Y}
              r="3.5"
              fill={color}
              opacity=".45"
            />

            {/* end dot */}
            <circle
              cx={arc.endX}
              cy={HORIZON_Y}
              r="3.5"
              fill={color}
              opacity=".45"
            />

            {/* animated satellite dot */}
            <g id="sat-dot">
              <circle
                id="pulse-ring"
                cx="0"
                cy="0"
                r="5"
                fill="none"
                stroke={color}
                strokeWidth="1"
              />
              <circle cx="0" cy="0" r="4.5" fill={color} opacity=".9" />
              <circle cx="0" cy="0" r="2" fill="white" opacity=".95" />
            </g>
          </>
        )}

        {/* ── no pass selected state ── */}
        {!selectedPass && (
          <text
            x={W / 2}
            y={HORIZON_Y / 2}
            textAnchor="middle"
            fontSize="12"
            fill="rgba(255,255,255,0.2)"
            fontFamily="system-ui"
          >
            Select a pass from the left panel
          </text>
        )}

        {/* ── compass bar ── */}
        <rect
          x="0"
          y={HORIZON_Y + 10}
          width={W}
          height="24"
          fill="rgba(0,0,0,0.55)"
        />

        {COMPASS.map((c) => {
          const active = selectedPass
            ? isOnPath(c.az, selectedPass.startAz, selectedPass.endAz)
            : false;
          return (
            <text
              key={c.label}
              x={c.x}
              y={COMPASS_Y}
              fontSize="10"
              textAnchor="middle"
              fontFamily="system-ui"
              fontWeight={active ? "600" : "400"}
              fill={active ? `${color}cc` : "rgba(255,255,255,0.3)"}
            >
              {c.label}
              {active && selectedPass?.startAzCompass === c.label ? " ↑" : ""}
            </text>
          );
        })}

        {/* ── top left — location ── */}
        <text
          x="14"
          y="20"
          fontSize="11"
          fill="rgba(255,255,255,0.28)"
          fontFamily="system-ui"
        >
          {location ? `Live sky view — ${location.name}` : "Live sky view"}
        </text>

        {/* ── top right — satellite indicator ── */}
        {selectedPass && (
          <g>
            {/* <circle cx={W - 62} cy="13" r="4" fill={color} /> */}
            <text
              x={W - 100}
              y="20"
              fontSize="11"
              fill="rgba(255,255,255,0.5)"
              fontFamily="system-ui"
            >
              {selectedPass.satname}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
