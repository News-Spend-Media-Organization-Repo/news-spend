import type { Platform, Range, TopSort } from "@news-spend-media/analytics";
import {
  isDateRange,
  PLATFORMS,
  RANGE_DAYS,
  resolveRange,
  resolveWindow,
  TOP_SORTS,
} from "@news-spend-media/analytics";

export type Days = (typeof RANGE_DAYS)[number];

export const DEFAULT_DAYS: Days = 30;

export const DEFAULT_SORT: TopSort = "readers";

/** How each way of ranking top articles is named on screen. */
export const SORT_LABELS: Record<TopSort, string> = {
  readers: "Unique readers",
  reads: "Qualified reads",
  views: "Views",
  impressions: "Impressions",
  rising: "Rising",
};

type Query = Record<string, string | string[] | undefined> | undefined;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** A period from anything a URL or a widget's settings might hold. */
export function toDays(value: unknown): Days {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return (RANGE_DAYS as readonly number[]).includes(days)
    ? (days as Days)
    : DEFAULT_DAYS;
}

/** A ranking from anything a URL or a widget's settings might hold. */
export function toSort(value: unknown): TopSort {
  const sort = Array.isArray(value) ? value[0] : value;
  return (TOP_SORTS as readonly unknown[]).includes(sort)
    ? (sort as TopSort)
    : DEFAULT_SORT;
}

/**
 * The period and platform an analytics screen was asked for. Anything that is
 * not one of the offered choices is ignored rather than passed on: the query
 * string is user input.
 *
 * A custom window needs both dates; one date alone falls back to the preset.
 */
export function parseAnalyticsParams(query: Query): {
  days: Days;
  from?: string;
  to?: string;
  platform?: Platform;
  sort: TopSort;
} {
  const platform = first(query?.platform);
  const from = first(query?.from);
  const to = first(query?.to);
  const custom =
    from !== undefined && to !== undefined && isDateRange(from, to)
      ? { from, to }
      : {};

  return {
    days: toDays(first(query?.days)),
    ...custom,
    sort: toSort(first(query?.sort)),
    platform: (PLATFORMS as readonly string[]).includes(platform ?? "")
      ? (platform as Platform)
      : undefined,
  };
}

/** The window a screen should read, preset or custom. */
export function resolvePeriod(
  period: { days: Days; from?: string; to?: string },
  timeZone: string,
  now?: Date
): Range {
  return period.from && period.to
    ? resolveWindow({ from: period.from, to: period.to, timeZone })
    : resolveRange({ days: period.days, timeZone, now });
}
