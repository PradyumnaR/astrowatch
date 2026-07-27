import type { SatellitePass } from "@/types";
import ScoreBadge from "@/components/ScoreBadge";
import { formatPassTime } from "@/lib/formatPassTime";
import { useAstroStore } from "@/stores/astrowatch";
import { useMemo } from "react";

export default function PassItem({
  pass,
  isSelected,
  onClick,
}: {
  pass: SatellitePass;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { location } = useAstroStore();
  const timezone = useMemo(() => location?.timezone, [location?.timezone]);

  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl p-2.5",
        "border transition-colors cursor-pointer",
        isSelected
          ? "border-aw-purple bg-aw-purple/5"
          : "border-aw-border bg-aw-tint" +
            " hover:bg-aw-tint-hover hover:border-aw-border",
      ].join(" ")}
    >
      {/* name + score */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium text-aw-text truncate">
            {pass.satname}
          </span>
          <span className="text-[10px] font-medium text-aw-text-muted truncate">
            #{pass.satid}
          </span>
        </div>
        <ScoreBadge score={pass.viewingScore ?? 0} />
      </div>

      {/* time · elevation · duration */}
      <div className="flex gap-2.5">
        <span className="text-[11px] text-aw-text-muted">
          ⏱ {formatPassTime(pass.startUTC, timezone || "")}
        </span>
        <span className="text-[11px] text-aw-text-muted">↑ {pass.maxEl}°</span>
        <span className="text-[11px] text-aw-text-muted">
          ⏳ {Math.round(pass.duration / 60)} min
        </span>
      </div>
    </button>
  );
}
