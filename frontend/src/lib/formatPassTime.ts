import { formatTime } from "./formatTime";

export function formatPassTime(utc: number): string {
  const passDate = new Date(utc * 1000);
  const today = new Date();
  const tomorrow = new Date();

  tomorrow.setDate(today.getDate() + 1);

  const isToday = passDate.toDateString() === today.toDateString();
  const isTomorrow = passDate.toDateString() === tomorrow.toDateString();

  const dateLabel = isToday
    ? "Today"
    : isTomorrow
      ? "Tomorrow"
      : passDate.toLocaleDateString();
  const timeStr = formatTime(utc);

  return `${dateLabel} . ${timeStr}`;
}
