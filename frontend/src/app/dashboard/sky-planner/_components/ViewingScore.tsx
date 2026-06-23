export default function ViewingScore({ score }: { score: number }) {
  const color =
    score >= 8
      ? "text-aw-teal"
      : score >= 5
        ? "text-aw-amber"
        : "text-white/30";

  const label = score >= 8 ? "Excellent" : score >= 5 ? "Good" : "Poor";

  return (
    <div>
      <div className="flex items-end gap-2 mb-2">
        <span className={`text-3xl font-semibold ${color}`}>
          {score.toFixed(1)}
        </span>
        <span className="text-[11px] text-white/30 mb-1">{label}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full ${
              i < Math.round(score)
                ? score >= 8
                  ? "bg-aw-teal"
                  : score >= 5
                    ? "bg-aw-amber"
                    : "bg-red-500/60"
                : "bg-white/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
