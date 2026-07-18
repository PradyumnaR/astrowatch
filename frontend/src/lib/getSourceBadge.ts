const SOURCE_BADGES: Record<
  string,
  {
    label: string;
    color: string;
  }
> = {
  nasa_apod: {
    label: "NASA",
    color: "text-aw-amber  bg-aw-amber/10  border-aw-amber/20",
  },
  wikipedia: {
    label: "Wikipedia",
    color: "text-[#4da6f5] bg-[#4da6f5]/10 border-[#4da6f5]/20",
  },
  spaceflight_news: {
    label: "Spaceflight News",
    color: "text-aw-teal   bg-aw-teal/10   border-aw-teal/20",
  },
};

export function getSourceBadge(source: string) {
  return (
    SOURCE_BADGES[source] ?? {
      label: source,
      color: "text-aw-purple bg-aw-purple/10 border-aw-purple/20",
    }
  );
}
