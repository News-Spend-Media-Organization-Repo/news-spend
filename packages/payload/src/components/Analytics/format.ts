import { percentChange } from "@news-spend-media/analytics";

export { formatCount, formatDay } from "./chartFormat";

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

/** Milliseconds as `7d 4h`, `5h 12m` or `12m`, for countdowns. */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) {
    return "–";
  }
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

/** The calendar date, `YYYY-MM-DD`, that an instant falls on in `timeZone`. */
export function localDay(iso: string, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}
