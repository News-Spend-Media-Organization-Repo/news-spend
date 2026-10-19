import type { Series } from "../ui";

/** One point of a daily chart: the value of one series on one day. */
export type TrendRow = { date: string; series: string; value: number };

const numberOrZero = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Days and series as one row per day and series, in day order. A missing,
 * non-numeric or non-finite value is a zero, so a chart never throws on data.
 */
export function trendRows(
  days: ({ date: string } & Record<string, number | string>)[],
  series: Series[]
): TrendRow[] {
  return days.flatMap((day) =>
    series.map((s) => ({
      date: day.date,
      series: s.key,
      value: numberOrZero(day[s.key]),
    }))
  );
}

/** True when at least one value is above zero, i.e. there is something to draw. */
export const hasData = (rows: { value: number }[]): boolean =>
  rows.some((row) => row.value > 0);
