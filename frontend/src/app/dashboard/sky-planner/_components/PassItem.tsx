import type { SatellitePass } from "@/types";
import ScoreBadge from "@/components/ScoreBadge";
import { formatPassTime } from "@/lib/formatPassTime";

export default function PassItem({
  pass,
  isSelected,
  onClick,
}: {
  pass: SatellitePass;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl p-2.5",
        "border transition-colors cursor-pointer",
        isSelected
          ? "border-aw-purple bg-aw-purple/5"
          : "border-aw-border bg-white/[0.03]" +
            " hover:bg-white/[0.06] hover:border-white/15",
      ].join(" ")}
    >
      {/* name + score */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium text-white truncate">
            {pass.satname}
          </span>
          <span className="text-[10px] font-medium text-white/40 truncate">
            #{pass.satid}
          </span>
        </div>
        <ScoreBadge score={pass.viewingScore ?? 0} />
      </div>

      {/* time · elevation · duration */}
      <div className="flex gap-2.5">
        <span className="text-[11px] text-white/30">
          ⏱ {formatPassTime(pass.startUTC)}
        </span>
        <span className="text-[11px] text-white/30">↑ {pass.maxEl}°</span>
        <span className="text-[11px] text-white/30">
          ⏳ {Math.round(pass.duration / 60)} min
        </span>
      </div>
    </button>
  );
}
