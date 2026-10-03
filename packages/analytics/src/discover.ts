import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { percent, rowsOf } from "./db";
import type { DateWindow, Range } from "./range";
import { eachDay, inWindow } from "./range";
import type { AnalyticsScope } from "./scope";
import { requireStaff } from "./scope";

/**
 * Is the Discover tab used?
 *
 * Built on `discover_events`, which the app has sent since the version that
 * added them. A "person" here is a device, as in the news figures, because a
 * guest has no account and an account can have several phones. Older app
 * builds send nothing, so a number is a floor, not the whole audience, until
 * most people have updated: the reach figure says how much of the audience it
 * is measured against, which is the honest way to read it.
 *
 * Staff only. Every figure is a count or a group label; nothing names a person.
 */

export type DiscoverFilter = { range: Range };

/** The sections of the tab, in the order the app shows them. */
export const DISCOVER_SECTIONS = [
  "all",
  "apps",
  "games",
  "books",
  "surveys",
] as const;

/** What can be opened from the tab. */
export const DISCOVER_ITEM_TYPES = [
  "game",
  "app",
  "book",
  "survey",
  "giveaway",
  "brands",
] as const;

export type DiscoverSummary = {
  /** Devices that opened Discover, this period and the one before it. */
  openers: { current: number; previous: number };
  /** Devices that read news in the period: the audience Discover could reach. */
  readers: number;
  /** Openers per reader, as a percentage. */
  reach: number | null;
  /** Items opened from the tab, of any kind. */
  itemOpens: number;
  gameLaunches: number;
  gamesBlocked: number;
  gameReports: number;
};

function openersIn(window: DateWindow, timeZone: string) {
  return sql`
    SELECT COUNT(DISTINCT e.device_id)::int AS n
    FROM discover_events e
    WHERE e.event = 'view' AND ${inWindow(sql.raw("e.timestamp"), window, timeZone)}`;
}

export async function discoverSummary(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: DiscoverFilter
): Promise<DiscoverSummary> {
  requireStaff(scope);
  const { timeZone, current, previous } = filter.range;

  const [openersNow, openersBefore, readers, counts] = await Promise.all([
    rowsOf<{ n: number }>(db, openersIn(current, timeZone)),
    rowsOf<{ n: number }>(db, openersIn(previous, timeZone)),
    rowsOf<{ n: number }>(
      db,
      sql`
        SELECT COUNT(DISTINCT n.device_id)::int AS n
        FROM news_analytics n
        WHERE n.event = 'view'
          AND ${inWindow(sql.raw("n.timestamp"), current, timeZone)}`
    ),
    rowsOf<{ event: string; n: number }>(
      db,
      sql`
        SELECT e.event::text AS event, COUNT(*)::int AS n
        FROM discover_events e
        WHERE ${inWindow(sql.raw("e.timestamp"), current, timeZone)}
          AND e.event IN ('open', 'game_launch', 'game_blocked', 'game_report')
        GROUP BY e.event`
    ),
  ]);

  const count = (event: string) =>
    counts.find((row) => row.event === event)?.n ?? 0;
  const now = openersNow[0]?.n ?? 0;
  const readerCount = readers[0]?.n ?? 0;

  return {
    openers: { current: now, previous: openersBefore[0]?.n ?? 0 },
    readers: readerCount,
    reach: percent(now, readerCount),
    itemOpens: count("open"),
    gameLaunches: count("game_launch"),
    gamesBlocked: count("game_blocked"),
    gameReports: count("game_report"),
  };
}

export type DiscoverSection = {
  section: string;
  views: number;
  people: number;
};

/**
 * How often each section was shown: opening the tab on it, or switching to it.
 * Every section is present, as zero when nothing was recorded.
 */
export async function discoverSections(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: DiscoverFilter
): Promise<DiscoverSection[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;
  const rows = await rowsOf<{ section: string; views: number; people: number }>(
    db,
    sql`
      SELECT e.section AS section,
             COUNT(*)::int AS views,
             COUNT(DISTINCT e.device_id)::int AS people
      FROM discover_events e
      WHERE e.event IN ('view', 'section')
        AND e.section IS NOT NULL
        AND ${inWindow(sql.raw("e.timestamp"), current, timeZone)}
      GROUP BY e.section`
  );
  const bySection = new Map(rows.map((row) => [row.section, row]));
  return DISCOVER_SECTIONS.map((section) => ({
    section,
    views: bySection.get(section)?.views ?? 0,
    people: bySection.get(section)?.people ?? 0,
  }));
}

export type DiscoverItemType = { type: string; opens: number; people: number };

/** What people open from the tab. Every kind is present, as zero when unused. */
export async function discoverItems(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: DiscoverFilter
): Promise<DiscoverItemType[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;
  const rows = await rowsOf<{ type: string; opens: number; people: number }>(
    db,
    sql`
      SELECT e.item_type AS type,
             COUNT(*)::int AS opens,
             COUNT(DISTINCT e.device_id)::int AS people
      FROM discover_events e
      WHERE e.event = 'open'
        AND e.item_type IS NOT NULL
        AND ${inWindow(sql.raw("e.timestamp"), current, timeZone)}
      GROUP BY e.item_type`
  );
  const byType = new Map(rows.map((row) => [row.type, row]));
  const known = DISCOVER_ITEM_TYPES.map((type) => ({
    type,
    opens: byType.get(type)?.opens ?? 0,
    people: byType.get(type)?.people ?? 0,
  }));
  // Anything else the app reports is kept, so a new kind is not silently lost.
  const other = rows.filter(
    (row) => !(DISCOVER_ITEM_TYPES as readonly string[]).includes(row.type)
  );
  return [...known, ...other];
}

export type DiscoverGame = { game: string; launches: number; players: number };

/** The most-launched games. A launch is a game that actually started. */
export async function discoverGames(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: DiscoverFilter & { limit?: number }
): Promise<DiscoverGame[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;
  const limit = Math.min(Math.max(filter.limit ?? 10, 1), 50);
  return rowsOf<DiscoverGame>(
    db,
    sql`
      SELECT e.item_id AS game,
             COUNT(*)::int AS launches,
             COUNT(DISTINCT e.device_id)::int AS players
      FROM discover_events e
      WHERE e.event = 'game_launch'
        AND e.item_id IS NOT NULL
        AND ${inWindow(sql.raw("e.timestamp"), current, timeZone)}
      GROUP BY e.item_id
      ORDER BY launches DESC, game ASC
      LIMIT ${limit}`
  );
}

export type DiscoverDay = { date: string; openers: number };

/** Devices that opened Discover each day, with empty days filled in as zero. */
export async function discoverDaily(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: DiscoverFilter
): Promise<DiscoverDay[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;
  const rows = await rowsOf<{ day: string; n: number }>(
    db,
    sql`
      SELECT to_char((e.timestamp AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             COUNT(DISTINCT e.device_id)::int AS n
      FROM discover_events e
      WHERE e.event = 'view'
        AND ${inWindow(sql.raw("e.timestamp"), current, timeZone)}
      GROUP BY 1`
  );
  const byDay = new Map(rows.map((row) => [row.day, row.n]));
  return eachDay(current).map((date) => ({
    date,
    openers: byDay.get(date) ?? 0,
  }));
}
