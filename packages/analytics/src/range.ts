import type { SQL } from "@payloadcms/db-postgres/drizzle";
import { sql } from "@payloadcms/db-postgres/drizzle";

/** The periods the dashboards offer. Anything else is refused. */
export const RANGE_DAYS = [7, 30, 90] as const;

/** Calendar dates, `YYYY-MM-DD`, both ends included, in the range's time zone. */
export type DateWindow = { from: string; to: string };

export type Range = {
  timeZone: string;
  days: number;
  current: DateWindow;
  /** The same number of days immediately before `current`. */
  previous: DateWindow;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return formatDate(parseDate(date) + days * DAY_MS);
}

/** The calendar date it is right now in `timeZone`. */
function localDate(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/**
 * The window a dashboard shows for "the last `days` days".
 *
 * Whole calendar days in one time zone, ending today, so a chart has exactly
 * `days` bars and a day means the same thing in every query. UTC by default,
 * which is what the existing per-article stats use; pass the newsroom's zone
 * to have days start when its readers' days do.
 */
export function resolveRange(options: {
  days: number;
  now?: Date;
  timeZone?: string;
}): Range {
  const { days, now = new Date(), timeZone = "UTC" } = options;

  if (!(RANGE_DAYS as readonly number[]).includes(days)) {
    throw new RangeError(`days must be one of ${RANGE_DAYS.join(", ")}`);
  }

  let today: string;
  try {
    today = localDate(now, timeZone);
  } catch {
    throw new RangeError(`unknown time zone: ${timeZone}`);
  }

  const from = addDays(today, -(days - 1));
  const previousTo = addDays(from, -1);

  return {
    timeZone,
    days,
    current: { from, to: today },
    previous: { from: addDays(previousTo, -(days - 1)), to: previousTo },
  };
}

/** Every date in a window, in order. Used to fill days that had no events. */
export function eachDay(window: DateWindow): string[] {
  const days: string[] = [];
  for (let d = window.from; d <= window.to; d = addDays(d, 1)) {
    days.push(d);
  }
  return days;
}

/**
 * A SQL condition that a timestamp column falls inside a window.
 *
 * The window is dates and a zone; the column is compared as instants, so
 * midnight is midnight in that zone, including on days with a clock change.
 * `column` is always a literal written in this package, never caller input.
 */
export function inWindow(
  column: SQL,
  window: DateWindow,
  timeZone: string
): SQL {
  return sql`(${column} >= ((${window.from}::date)::timestamp AT TIME ZONE ${timeZone})
    AND ${column} < (((${window.to}::date + 1)::timestamp) AT TIME ZONE ${timeZone}))`;
}

/** `(current - previous) / previous` as a percentage, or `null` from zero. */
export function percentChange(
  current: number,
  previous: number
): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
