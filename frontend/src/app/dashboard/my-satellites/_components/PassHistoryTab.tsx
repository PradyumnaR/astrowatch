"use client";

import { useEffect, useState } from "react";
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
import { SAT_COLORS, DEFAULT_COLOR } from "@/consts";
import { useAstroStore } from "@/stores/astrowatch";
import type { WatchedPass } from "@/types";

function azToCompass(az: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(az / 45) % 8];
}

export default function PassHistoryTab() {
  const { location } = useAstroStore();
  const timeZone = location?.timezone ?? "";

  const [history, setHistory] = useState<WatchedPass[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/watched-passes?scope=past");
        const data = (await res.json()) as WatchedPass[];
        setHistory(data);
      } catch (err) {
        console.error("Failed to fetch pass history:", err);
        setHistory([]);
      }
    }

    fetchHistory();
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/watched-passes/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setHistory((prev) => (prev ?? []).filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete watched pass:", err);
    } finally {
      setDeletingId(null);
    }
  }

  if (history === null) {
    return <TableSkeleton />;
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-aw-text-muted text-sm font-medium">
          No pass history yet
        </p>
        <p className="text-aw-text-muted text-[12px] leading-relaxed max-w-xs">
          Passes you watch will show up here once they&apos;ve completed
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[13px] font-medium text-aw-text">
            Pass history
          </p>
          <p className="text-[11px] text-aw-text-muted mt-0.5">
            {history.length} completed pass{history.length === 1 ? "" : "es"}
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-aw-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-aw-border hover:bg-transparent">
              <TableHead className="text-aw-text-muted text-[10px] font-medium uppercase tracking-widest">
                Satellite
              </TableHead>
              <TableHead className="text-aw-text-muted text-[10px] font-medium uppercase tracking-widest">
                Date & time
              </TableHead>
              <TableHead className="text-aw-text-muted text-[10px] font-medium uppercase tracking-widest">
                Score
              </TableHead>
              <TableHead className="text-aw-text-muted text-[10px] font-medium uppercase tracking-widest">
                Max el.
              </TableHead>
              <TableHead className="text-aw-text-muted text-[10px] font-medium uppercase tracking-widest">
                Duration
              </TableHead>
              <TableHead className="text-aw-text-muted text-[10px] font-medium uppercase tracking-widest">
                Direction
              </TableHead>
              <TableHead className="text-aw-text-muted text-[10px] font-medium uppercase tracking-widest">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {history.map((watched) => {
              const p = watched.passData;
              const deleting = deletingId === watched.id;

              return (
                <TableRow
                  key={watched.id}
                  className="border-aw-border hover:bg-aw-tint-hover transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          background:
                            SAT_COLORS[watched.noradId] ?? DEFAULT_COLOR,
                        }}
                      />
                      <div>
                        <p className="text-[12px] font-medium text-aw-text">
                          {watched.satname}
                        </p>
                        <p className="text-[10px] text-aw-text-muted">
                          #{watched.noradId}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-[12px] text-aw-text-sec">
                    {formatPassTime(watched.startUTC, timeZone)}
                  </TableCell>

                  <TableCell>
                    <ScoreBadge score={p.viewingScore ?? 0} />
                  </TableCell>

                  <TableCell className="text-[12px] text-aw-text-sec">
                    {p.maxEl}°
                  </TableCell>

                  <TableCell className="text-[12px] text-aw-text-sec">
                    {Math.round(p.duration / 60)} min
                  </TableCell>

                  <TableCell>
                    <span className="font-mono text-[11px] text-aw-text-muted">
                      {p.startAzCompass} → {azToCompass(p.endAz)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <button
                      onClick={() => handleDelete(watched.id)}
                      disabled={deleting}
                      className="cursor-pointer text-[10px] border rounded-full
                        px-2.5 py-1 transition-colors
                        border-aw-border text-aw-text-muted
                        hover:text-red-400 hover:border-red-400/40
                        disabled:opacity-50 disabled:cursor-wait"
                    >
                      {deleting ? "..." : "Delete"}
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-aw-border overflow-hidden">
      <div className="p-3 border-b border-aw-border flex gap-4">
        {[120, 100, 60, 60, 70, 80, 60].map((w, i) => (
          <div
            key={i}
            className="h-3 rounded bg-aw-tint animate-pulse"
            style={{ width: w }}
          />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-3 border-b border-aw-border flex gap-4">
          {[120, 100, 60, 60, 70, 80, 60].map((w, j) => (
            <div
              key={j}
              className="h-3 rounded bg-aw-tint animate-pulse"
              style={{ width: w }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
