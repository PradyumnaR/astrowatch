export default function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-24 rounded-xl bg-white/[0.03]
          animate-pulse"
      />
      <div
        className="h-12 rounded-lg bg-white/[0.02]
          animate-pulse"
      />
      <div
        className="h-12 rounded-lg bg-white/[0.02]
          animate-pulse"
      />
    </div>
  );
}
