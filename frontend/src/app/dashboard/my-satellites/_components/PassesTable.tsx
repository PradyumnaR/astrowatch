"use client";

import { useEffect, useMemo, useState } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPassTime } from "@/lib/formatPassTime";
import ScoreBadge from "@/components/ScoreBadge";
import { SAT_COLORS, DEFAULT_COLOR, UserMessages } from "@/consts";
import { SatellitePass } from "@/types";
import { isAtPassLimit } from "@/lib/plans";
import UpgradeModal from "@/components/ui/UpgradeModal";

type SortKey = "date" | "score" | "elevation" | "satellite";
type SortDir = "asc" | "desc";

export default function PassTable() {
  const {
    savedSatellites,
    savedPasses,
    isLoadingSaved,
    isLoadingSavedPasses,
    location,
    userPlan,
  } = useAstroStore();

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  // maps "satid-startUTC" -> the watched-pass row's own Supabase id, so an
  // already-watched row can be unwatched (deleted by that id) later
  const [watchedPasses, setWatchedPasses] = useState<Map<string, string>>(
    new Map(),
  );
  const [watchingId, setWatchingId] = useState<string | null>(null);

  const timeZone = useMemo(() => location?.timezone, [location?.timezone]);

  // add state
  const [showUpgrade, setShowUpgrade] = useState(false);
  const atPassLimit = isAtPassLimit(userPlan ?? "standard", watchedPasses.size);

  useEffect(() => {
    async function fetchWatched() {
      try {
        const res = await fetch("/api/watched-passes");
        const data = await res.json();
        const map = new Map<string, string>(
          data.map((p: any) => [
            `${p.passData.satid}-${p.passData.startUTC}`,
            p.id,
          ]),
        );
        setWatchedPasses(map);
      } catch (err) {
        console.log("Failed to fetch watching passes", err);
      }
    }

    fetchWatched();
  }, [savedSatellites.length]);

  async function handleWatch(pass: SatellitePass) {
    const key = `${pass.satid}-${pass.startUTC}`;
    if (watchedPasses.has(key)) return;

    // check limit before calling API
    if (atPassLimit) {
      setShowUpgrade(true);
      return;
    }

    setWatchingId(key);

    try {
      const res = await fetch("/api/watched-passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noradId: pass.satid,
          satname: pass.satname,
          startUTC: pass.startUTC,
          passData: pass,
        }),
      });

      // handle backend limit response
      if (res.status === 403) {
        setShowUpgrade(true);
        return;
      }

      if (!res.ok) throw new Error("Watch failed");

      const data = await res.json();
      setWatchedPasses((prev) => new Map(prev).set(key, data.id));
    } catch (err) {
      console.error("Watch failed:", err);
    } finally {
      setWatchingId(null);
    }
  }

  async function handleUnwatch(pass: SatellitePass) {
    const key = `${pass.satid}-${pass.startUTC}`;
    const rowId = watchedPasses.get(key);
    if (!rowId) return;

    setWatchingId(key);

    try {
      const res = await fetch(`/api/watched-passes/${rowId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Unwatch failed");

      setWatchedPasses((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } catch (err) {
      console.error("Unwatch failed:", err);
    } finally {
      setWatchingId(null);
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // filter out past passes
  //const now = Math.floor(Date.now() / 1000);
  //const futurePasses = savedPasses.filter((p) => p.startUTC > now);

  // sort
  const sorted = [...savedPasses].sort((a, b) => {
    let diff = 0;
    switch (sortKey) {
      case "date":
        diff = a.startUTC - b.startUTC;
        break;
      case "score":
        diff = (b.viewingScore ?? 0) - (a.viewingScore ?? 0);
        break;
      case "elevation":
        diff = b.maxEl - a.maxEl;
        break;
      case "satellite":
        diff = a.satname.localeCompare(b.satname);
        break;
    }
    return sortDir === "asc" ? diff : -diff;
  });

  // ── empty states ──────────────────────────────────

  if (savedSatellites.length === 0) {
    return (
      <EmptyState
        title="No saved satellites"
        subtitle="Save satellites from the Browse tab
          to see their upcoming passes here"
      />
    );
  }

  if (isLoadingSaved || isLoadingSavedPasses) {
    return <TableSkeleton />;
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No upcoming passes"
        subtitle="None of your saved satellites have
          visible passes in the next 7 days
          from your location"
      />
    );
  }

  // ── date range label ──────────────────────────────

  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 7);

  const dateRange = `${formatDate(start)} – ${formatDate(end)}`;

  // ── render ────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">
      {showUpgrade && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          message={UserMessages.PassesLimit}
          title={UserMessages.PassesLimitTitle}
        />
      )}
      {/* header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[13px] font-medium text-aw-text">
            Upcoming passes
          </p>
          <p className="text-[11px] text-aw-text-muted mt-0.5">
            {dateRange} · {savedSatellites.length} satellites · {sorted.length}{" "}
            passes
          </p>
        </div>
      </div>
      {/* table */}
      <div
        className="rounded-xl border border-aw-border
        overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow
              className="border-aw-border
              hover:bg-transparent"
            >
              <SortableHead
                label="Satellite"
                sortKey="satellite"
                current={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Date & time"
                sortKey="date"
                current={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Score"
                sortKey="score"
                current={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Max el."
                sortKey="elevation"
                current={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <TableHead
                className="text-aw-text-muted text-[10px]
                font-medium uppercase tracking-widest"
              >
                Duration
              </TableHead>
              <TableHead
                className="text-aw-text-muted text-[10px]
                font-medium uppercase tracking-widest"
              >
                Direction
              </TableHead>
              <TableHead
                className="text-aw-text-muted text-[10px]
                font-medium uppercase tracking-widest"
              >
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {sorted.map((pass) => (
              <TableRow
                key={`${pass.satid}-${pass.startUTC}`}
                className="border-aw-border
                  hover:bg-aw-tint-hover transition-colors"
              >
                {/* satellite */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-1.5 h-1.5 rounded-full
                        flex-shrink-0"
                      style={{
                        background: SAT_COLORS[pass.satid] ?? DEFAULT_COLOR,
                      }}
                    />
                    <div>
                      <p
                        className="text-[12px] font-medium
                        text-aw-text"
                      >
                        {pass.satname}
                      </p>
                      <p className="text-[10px] text-aw-text-muted">
                        #{pass.satid}
                      </p>
                    </div>
                  </div>
                </TableCell>

                {/* date & time */}
                <TableCell
                  className="text-[12px]
                  text-aw-text-sec"
                >
                  {formatPassTime(pass.startUTC, timeZone || "")}
                </TableCell>

                {/* score */}
                <TableCell>
                  <ScoreBadge score={pass.viewingScore ?? 0} />
                </TableCell>

                {/* max elevation */}
                <TableCell
                  className="text-[12px]
                  text-aw-text-sec"
                >
                  {pass.maxEl}°
                </TableCell>

                {/* duration */}
                <TableCell
                  className="text-[12px]
                  text-aw-text-sec"
                >
                  {Math.round(pass.duration / 60)} min
                </TableCell>

                {/* direction */}
                <TableCell>
                  <span
                    className="font-mono text-[11px]
                    text-aw-text-muted"
                  >
                    {pass.startAzCompass} → {azToCompass(pass.endAz)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {/* watch / unwatch button */}
                    {(() => {
                      const key = `${pass.satid}-${pass.startUTC}`;
                      const watched = watchedPasses.has(key);
                      const loading = watchingId === key;
                      const locked = atPassLimit && !watched;

                      return (
                        <button
                          onClick={() => {
                            if (loading) return;
                            if (watched) return handleUnwatch(pass);
                            if (locked) return setShowUpgrade(true);
                            return handleWatch(pass);
                          }}
                          disabled={loading}
                          className={`group cursor-pointer flex items-center gap-1.5
                            text-[10px] border rounded-full
                            px-2.5 py-1 transition-colors
                            ${
                              watched
                                ? "border-aw-teal/30 text-aw-teal bg-aw-teal/8 hover:border-red-400/40 hover:text-red-400 hover:bg-red-400/8"
                                : loading
                                  ? "border-aw-border text-aw-text-muted cursor-wait"
                                  : locked
                                    ? "border-aw-amber/30 text-aw-amber/60 bg-aw-amber/6"
                                    : "border-aw-border text-aw-text-muted hover:text-aw-teal hover:border-aw-teal/40"
                            }`}
                        >
                          {watched ? (
                            loading ? (
                              "..."
                            ) : (
                              <>
                                <span className="group-hover:hidden">
                                  ★ Watching
                                </span>
                                <span className="hidden group-hover:inline">
                                  ✕ Unwatch
                                </span>
                              </>
                            )
                          ) : loading ? (
                            "..."
                          ) : locked ? (
                            "🔒"
                          ) : (
                            "☆ Watch"
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function azToCompass(az: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(az / 45) % 8];
}

// ── sub-components ────────────────────────────────────

function SortableHead({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <TableHead
      onClick={() => onSort(sortKey)}
      className={`text-[10px] font-medium uppercase
        tracking-widest cursor-pointer select-none
        transition-colors
        ${active ? "text-aw-purple" : "text-aw-text-muted hover:text-aw-text-sec"}`}
    >
      {label}{" "}
      <span className="text-[10px]">
        {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </TableHead>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      className="flex flex-col items-center
      justify-center gap-3 py-20 text-center"
    >
      <p className="text-aw-text-muted text-sm font-medium">{title}</p>
      <p
        className="text-aw-text-muted text-[12px]
        leading-relaxed max-w-xs"
      >
        {subtitle}
      </p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      className="rounded-xl border border-aw-border
      overflow-hidden"
    >
      <div
        className="p-3 border-b border-aw-border
        flex gap-4"
      >
        {[120, 100, 60, 60, 70, 80, 60].map((w, i) => (
          <div
            key={i}
            className="h-3 rounded bg-aw-tint
              animate-pulse"
            style={{ width: w }}
          />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-3 border-b border-aw-border flex gap-4">
          {[120, 100, 60, 60, 70, 80, 60].map((w, j) => (
            <div
              key={j}
              className="h-3 rounded bg-aw-tint
                animate-pulse"
              style={{ width: w }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
