import { formatTime } from "./formatTime";

function getDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatPassTime(utc: number, timezone: string): string {
  const passDate = new Date(utc * 1000);
  const now = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);

  const passStr = getDateString(passDate, timezone);
  const todayStr = getDateString(now, timezone);
  const tomorrowStr = getDateString(tomorrow, timezone);

  const isToday = passStr === todayStr;
  const isTomorrow = passStr === tomorrowStr;

  const dateLabel = isToday
    ? "Today"
    : isTomorrow
      ? "Tomorrow"
      : passDate.toLocaleDateString();
  const timeStr = formatTime(utc, timezone);

  return `${dateLabel} . ${timeStr}`;
}
