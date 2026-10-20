import type { Platform, TopSort } from "@news-spend-media/analytics";
import { PLATFORMS, RANGE_DAYS, TOP_SORTS } from "@news-spend-media/analytics";

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
 */
export function parseAnalyticsParams(query: Query): {
  days: Days;
  platform?: Platform;
  sort: TopSort;
} {
  const platform = first(query?.platform);
  return {
    days: toDays(first(query?.days)),
    sort: toSort(first(query?.sort)),
    platform: (PLATFORMS as readonly string[]).includes(platform ?? "")
      ? (platform as Platform)
      : undefined,
  };
}
