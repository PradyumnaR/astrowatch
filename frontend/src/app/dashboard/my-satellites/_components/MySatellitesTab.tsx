"use client";

import { useSavedSatellites } from "@/hooks/useSavedSatellites";
import { useAstroStore } from "@/stores/astrowatch";
import { SavedSatellite } from "@/types";
import { SAT_COLORS, DEFAULT_COLOR } from "@/consts";

export default function MySatellitesTab() {
  const { savedSatellites, isLoadingSaved, isLoadingSavedPasses, removeSaved } =
    useAstroStore();
  const { handleRemoveSat } = useSavedSatellites();

  if (isLoadingSaved || isLoadingSavedPasses) {
    return (
      <div className="flex flex-col gap-2 pt-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-10 rounded-xl bg-white/[0.03]
              animate-pulse"
          />
        ))}
      </div>
    );
  }

  // empty state
  if (savedSatellites.length === 0) {
    return (
      <div
        className="flex flex-col items-center
          justify-center gap-2 py-10 text-center px-4"
      >
        <p className="text-white/20 text-sm">No saved satellites yet</p>
        <p
          className="text-white/15 text-[11px]
            leading-relaxed"
        >
          Browse the catalogue and save satellites to track their passes
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p
        className="text-[10px] font-medium tracking-widest
        uppercase text-white/25 mb-1"
      >
        {savedSatellites.length} saved
      </p>

      {savedSatellites.map((sat) => (
        <div
          key={sat.noradId}
          className="flex items-center gap-3
            bg-white/[0.03] border border-aw-border
            rounded-xl px-3 py-2.5
            hover:bg-white/[0.05] transition-colors"
        >
          {/* color dot */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: SAT_COLORS[sat.noradId] ?? DEFAULT_COLOR,
            }}
          />

          {/* name + norad */}
          <div className="flex-1 min-w-0">
            <p
              className="text-[12px] font-medium
              text-white truncate"
            >
              {sat.satname}
            </p>
            <p className="text-[10px] text-white/25 mt-0.5">#{sat.noradId}</p>
          </div>

          {/* remove */}
          <button
            onClick={() => handleRemoveSat(sat)}
            className="text-white/15 hover:text-red-400
              transition-colors flex-shrink-0 p-1 rounded"
            aria-label={`Remove ${sat.satname}`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
