export default function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-24 rounded-xl bg-aw-tint
          animate-pulse"
      />
      <div
        className="h-12 rounded-lg bg-aw-tint
          animate-pulse"
      />
      <div
        className="h-12 rounded-lg bg-aw-tint
          animate-pulse"
      />
    </div>
  );
}
