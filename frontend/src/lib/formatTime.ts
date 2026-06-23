export function formatTime(utc: number): string {
  return new Date(utc * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
