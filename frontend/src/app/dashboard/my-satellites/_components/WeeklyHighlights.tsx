"use client";

import { useSavedSatellites } from "@/hooks/useSavedSatellites";
import { useAstroStore } from "@/stores/astrowatch";
import type { SatellitePass } from "@/types";
import { formatPassTime } from "@/lib/formatPassTime";
import { SAT_COLORS, DEFAULT_COLOR } from "@/consts";

export default function WeeklyHighlights() {
  const { savedSatellites } = useSavedSatellites();
  const { savedPasses } = useAstroStore();

  // ── empty states ──────────────────────────────────

  if (savedSatellites.length === 0) {
    return (
      <EmptyState
        text="Save satellites from the Browse tab
          to see weekly highlights"
      />
    );
  }

  if (savedPasses.length === 0) {
    return (
      <EmptyState
        text="No visible passes this week
          from your location"
      />
    );
  }

  // ── section 1: best pass per satellite ────────────

  // group passes by satid, keep the highest-scoring one
  const bestBySat = new Map<number, SatellitePass>();
  for (const pass of savedPasses) {
    const current = bestBySat.get(pass.satid);
    if (!current || (pass.viewingScore ?? 0) > (current.viewingScore ?? 0)) {
      bestBySat.set(pass.satid, pass);
    }
  }

  const highlights = [...bestBySat.values()].sort(
    (a, b) => (b.viewingScore ?? 0) - (a.viewingScore ?? 0),
  );

  // ── section 2: pass counts per satellite ──────────

  const countBySat = new Map<number, { name: string; count: number }>();
  for (const pass of savedPasses) {
    const entry = countBySat.get(pass.satid);
    if (entry) {
      entry.count += 1;
    } else {
      countBySat.set(pass.satid, { name: pass.satname, count: 1 });
    }
  }

  const breakdown = [...countBySat.entries()]
    .map(([satid, { name, count }]) => ({ satid, name, count }))
    .sort((a, b) => b.count - a.count);

  const maxCount = Math.max(...breakdown.map((b) => b.count), 1);

  // ── render ────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* section 1 */}
      <div className="flex flex-col gap-2">
        <p
          className="text-[10px] font-medium tracking-widest
          uppercase text-white/25"
        >
          This week&apos;s best
        </p>

        <div>
          {highlights.map((pass) => (
            <HighlightCard key={pass.satid} pass={pass} />
          ))}
        </div>
      </div>

      {/* section 2 */}
      <div className="flex flex-col gap-2">
        <p
          className="text-[10px] font-medium tracking-widest
          uppercase text-white/25"
        >
          Weekly breakdown
        </p>

        <div className="flex flex-col gap-2">
          {breakdown.map((b) => (
            <BreakdownRow
              key={b.satid}
              name={b.name}
              count={b.count}
              maxCount={maxCount}
              color={SAT_COLORS[b.satid] ?? DEFAULT_COLOR}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────

function HighlightCard({ pass }: { pass: SatellitePass }) {
  const color = SAT_COLORS[pass.satid] ?? DEFAULT_COLOR;
  const score = pass.viewingScore ?? 0;

  return (
    <div
      className="bg-white/[0.03] border border-aw-border
      rounded-xl p-3 mb-2"
    >
      {/* header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <p className="text-[12px] font-medium text-white">{pass.satname}</p>
      </div>

      {/* rows */}
      <div className="flex flex-col gap-1.5">
        <CardRow label="Best pass" value={formatPassTime(pass.startUTC)} />

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30">Score</span>
          <span className={`text-[11px] font-medium ${scoreColor(score)}`}>
            {score.toFixed(1)} · {scoreLabel(score)}
          </span>
        </div>

        <CardRow label="Max el." value={`${pass.maxEl}°`} />

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30">Direction</span>
          <span className="font-mono text-[11px] font-medium text-white/70">
            {pass.startAzCompass} → {azToCompass(pass.endAz)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CardRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-white/30">{label}</span>
      <span className="text-[11px] font-medium text-white/70">{value}</span>
    </div>
  );
}

function BreakdownRow({
  name,
  count,
  maxCount,
  color,
}: {
  name: string;
  count: number;
  maxCount: number;
  color: string;
}) {
  const width = `${(count / maxCount) * 100}%`;

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[11px] text-white/35 truncate"
        style={{ minWidth: 52 }}
      >
        {name}
      </span>
      <div className="flex-1 h-1 rounded bg-white/[0.06]">
        <div className="h-full rounded" style={{ width, background: color }} />
      </div>
      <span
        className="text-[11px] text-white/35 text-right"
        style={{ minWidth: 16 }}
      >
        {count}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p
      className="text-[11px] text-white/20 text-center
      leading-relaxed whitespace-pre-line py-8"
    >
      {text}
    </p>
  );
}

function azToCompass(az: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(az / 45) % 8];
}

function scoreLabel(score: number): string {
  if (score >= 8) return "Excellent";
  if (score >= 5) return "Good";
  return "Poor";
}

function scoreColor(score: number): string {
  if (score >= 8) return "text-aw-teal";
  if (score >= 5) return "text-aw-amber";
  return "text-white/30";
}
