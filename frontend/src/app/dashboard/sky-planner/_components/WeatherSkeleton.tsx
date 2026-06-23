export default function WeatherSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[80, 60, 70, 50, 65].map((w, i) => (
        <div
          key={i}
          className="h-4 rounded bg-white/5 animate-pulse"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}
