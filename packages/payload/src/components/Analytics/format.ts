import { percentChange } from "@news-spend-media/analytics";

/** 1,234 for small numbers, 12.3K from ten thousand up. */
export function formatCount(value: number): string {
  if (value >= 100_000) {
    return `${Math.round(value / 1000)}K`;
  }
  if (value >= 10_000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString("en-US");
}

export const formatPercent = (value: number | null): string =>
  value === null ? "–" : `${value}%`;

export type Change = { text: string; tone: "up" | "down" | "flat" };

/** How `current` moved from `previous`, as text and a direction. */
export function describeChange(current: number, previous: number): Change {
  const change = percentChange(current, previous);
  if (change === null) {
    return { text: previous === 0 && current > 0 ? "new" : "–", tone: "flat" };
  }
  if (change === 0) {
    return { text: "0%", tone: "flat" };
  }
  return {
    text: `${change > 0 ? "+" : ""}${change}%`,
    tone: change > 0 ? "up" : "down",
  };
}

/** `2026-09-19` as `19 Sep`. */
export function formatDay(date: string): string {
  const [, month, day] = date.split("-");
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${Number(day)} ${names[Number(month) - 1] ?? ""}`;
}

/** A timestamp as `19 Sep, 14:05` in the given zone. */
export function formatDateTime(iso: string | null, timeZone: string): string {
  if (!iso) {
    return "–";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}
