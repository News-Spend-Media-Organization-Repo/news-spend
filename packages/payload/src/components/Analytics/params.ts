import type { Platform } from "@news-spend-media/analytics";
import { PLATFORMS, RANGE_DAYS } from "@news-spend-media/analytics";

export type Days = (typeof RANGE_DAYS)[number];

export const DEFAULT_DAYS: Days = 30;

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

/**
 * The period and platform an analytics screen was asked for. Anything that is
 * not one of the offered choices is ignored rather than passed on: the query
 * string is user input.
 */
export function parseAnalyticsParams(query: Query): {
  days: Days;
  platform?: Platform;
} {
  const platform = first(query?.platform);
  return {
    days: toDays(first(query?.days)),
    platform: (PLATFORMS as readonly string[]).includes(platform ?? "")
      ? (platform as Platform)
      : undefined,
  };
}
