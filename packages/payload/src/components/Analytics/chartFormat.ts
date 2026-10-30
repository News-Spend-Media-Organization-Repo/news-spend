/**
 * The two formatters the client chart components need. They live apart from
 * `format.ts`, which imports the analytics package, so a chart in the browser
 * does not pull the whole read layer with it.
 */

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

/** A chosen window as `1–20 Oct 2026`, both ends included. */
export function formatWindow(from: string, to: string): string {
  const [fromYear, fromMonth, fromDay] = from.split("-");
  const [toYear, toMonth] = to.split("-");

  if (from === to) {
    return `${formatDay(from)} ${toYear}`;
  }
  if (fromYear !== toYear) {
    return `${formatDay(from)} ${fromYear} – ${formatDay(to)} ${toYear}`;
  }
  if (fromMonth !== toMonth) {
    return `${formatDay(from)} – ${formatDay(to)} ${toYear}`;
  }
  return `${Number(fromDay)}–${formatDay(to)} ${toYear}`;
}
