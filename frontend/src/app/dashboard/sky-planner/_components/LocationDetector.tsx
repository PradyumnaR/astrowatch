"use client";

import { useAstroStore } from "@/stores/astrowatch";
import { LocationStatus } from "@/types";

export default function LocationDetector() {
  const { location, locationStatus, fetchLocation } = useAstroStore();

  return (
    <div className="mb-5">
      <p
        className="text-[10px] font-medium tracking-widest
        uppercase text-white/30 mb-2"
      >
        Location
      </p>

      <div
        className="flex items-center gap-3 bg-white/5
        border border-aw-border rounded-xl p-3"
      >
        {/* icon — changes per status */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center
          justify-center flex-shrink-0 ${iconBg(locationStatus)}`}
        >
          <StatusIcon status={locationStatus} />
        </div>

        {/* text */}
        <div className="flex-1 min-w-0">
          {locationStatus === "detecting" ? (
            <>
              <div
                className="h-3 w-24 bg-white/10
                rounded animate-pulse mb-1.5"
              />
              <div
                className="h-2.5 w-16 bg-white/6
                rounded animate-pulse"
              />
            </>
          ) : (
            <>
              <p
                className="text-[13px] font-medium
                text-white"
              >
                {location?.name}
              </p>
              <p className="text-[11px] text-white/30 mt-0.5">
                {locationStatus === "denied" || locationStatus === "error" ? (
                  <span className="text-red-400/70">
                    Using default ·{" "}
                    <button
                      onClick={fetchLocation}
                      className="underline hover:text-red-300
                        transition-colors"
                    >
                      retry
                    </button>
                  </span>
                ) : (
                  `${location?.lat.toFixed(2)}°N · 
              ${Math.abs(location?.lng ?? 0).toFixed(2)}°W`
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── helpers ────────────────────────────────────────
function iconBg(status: LocationStatus): string {
  switch (status) {
    case "detecting":
      return "bg-aw-purple/15";
    case "detected":
      return "bg-aw-teal/12";
    case "denied":
    case "error":
      return "bg-red-500/10";
  }
}

function StatusIcon({ status }: { status: LocationStatus }) {
  switch (status) {
    case "detecting":
      return (
        <span
          className="text-aw-purple text-sm
        animate-spin inline-block"
        >
          ↻
        </span>
      );
    case "detected":
      return <span className="text-aw-teal text-sm">⌖</span>;
    case "denied":
    case "error":
      return <span className="text-red-400 text-sm">✕</span>;
  }
}
