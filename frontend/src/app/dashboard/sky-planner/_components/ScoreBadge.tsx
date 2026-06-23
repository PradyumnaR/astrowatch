export default function ScoreBadge({ score }: { score: number }) {
  const colour =
    score >= 8
      ? "bg-aw-teal/15 text-aw-teal"
      : score >= 5
        ? "bg-aw-amber/15 text-aw-amber"
        : "bg-white/6 text-white/30";

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={`text-[10px] font-semibold
        px-2 py-0.5 rounded-full ${colour}`}
      >
        {score.toFixed(1)}
      </span>
      <span className="text-[9px] text-white/25">Visibility</span>
    </div>
  );
}
