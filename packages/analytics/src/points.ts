import type { SQL } from "@payloadcms/db-postgres/drizzle";
import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { isoOrNull, percent, rowsOf } from "./db";
import type { DateWindow, Range } from "./range";
import { eachDay, inWindow } from "./range";
import type { AnalyticsScope } from "./scope";
import { requireStaff } from "./scope";

/**
 * The Dream Points economy: the `activities` rows of type `point`.
 *
 * Privacy exception: unlike the rest of this package, the leaderboard and the
 * large-grants panel carry a user id, used as the target of the admin's own
 * "Open account" link. The leaderboard also carries the display name and
 * username so staff can spot an account farming points without opening every
 * row. An email is never selected or shown.
 */

/**
 * A single grant above this is "large". It matches `MAX_SURVEY_POINTS` in the
 * survey award code (PRs #147/#148); the analytics package does not depend on
 * that package, so the number lives here too.
 */
export const LARGE_GRANT_POINTS = 5000;

export type PointsFilter = { range: Range };

export type PointsTotals = {
  issued: number;
  spent: number;
  reversed: number;
  net: number;
  activeEarners: number;
  largeGrants: number;
};

type TotalsRow = {
  issued: number;
  spent: number;
  reversed: number;
  active_earners: number;
  large_grants: number;
};

/** Point rows in a window. `a` is the only alias used by this module. */
const ledgerWhere = (window: DateWindow, timeZone: string): SQL =>
  sql`a.type = 'point'
    AND ${inWindow(sql.raw("a.created_at"), window, timeZone)}`;

/** Action, except surveyTask split by provider; legacy and bad data are `form`. */
export const SOURCE = sql`CASE
  WHEN a.action = 'surveyTask' THEN COALESCE(
    CASE WHEN jsonb_typeof(a.metadata) = 'object'
      THEN NULLIF(a.metadata->>'provider', '') END,
    'form')
  ELSE a.action::text
END`;

const ABSOLUTE = (condition: SQL): SQL =>
  sql`ABS(COALESCE(SUM(a.point) FILTER (WHERE ${condition}), 0))::float8`;

async function totalsFor(
  db: AnalyticsDb,
  filter: PointsFilter,
  window: DateWindow
): Promise<PointsTotals> {
  const [row] = await rowsOf<TotalsRow>(
    db,
    sql`
      SELECT COALESCE(SUM(a.point) FILTER (WHERE a.point > 0), 0)::float8 AS issued,
             ${ABSOLUTE(sql`a.point < 0 AND a.action <> 'pointReversal'`)} AS spent,
             ${ABSOLUTE(sql`a.action = 'pointReversal'`)} AS reversed,
             COUNT(DISTINCT a.user_id) FILTER (WHERE a.point > 0)::int AS active_earners,
             COUNT(*) FILTER (WHERE a.point > ${LARGE_GRANT_POINTS})::int AS large_grants
      FROM activities a
      WHERE ${ledgerWhere(window, filter.range.timeZone)}
    `
  );

  const issued = row?.issued ?? 0;
  const spent = row?.spent ?? 0;
  const reversed = row?.reversed ?? 0;
  return {
    issued,
    spent,
    reversed,
    net: issued - spent - reversed,
    activeEarners: row?.active_earners ?? 0,
    largeGrants: row?.large_grants ?? 0,
  };
}

export async function pointsSummary(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PointsFilter
): Promise<{
  current: PointsTotals;
  previous: PointsTotals;
  outstanding: number;
}> {
  requireStaff(scope);

  const [[current, previous], [outstanding]] = await Promise.all([
    Promise.all([
      totalsFor(db, filter, filter.range.current),
      totalsFor(db, filter, filter.range.previous),
    ]),
    rowsOf<{ outstanding: number }>(
      db,
      sql`
        SELECT COALESCE(SUM(a.point), 0)::float8 AS outstanding
        FROM activities a
        WHERE a.type = 'point'
      `
    ),
  ]);

  return { current, previous, outstanding: outstanding?.outstanding ?? 0 };
}

export type PointsDay = { date: string; issued: number; spent: number };

/** One row per day of the period, days with no ledger activity included as zeros. */
export async function pointsDaily(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PointsFilter
): Promise<PointsDay[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<{ day: string; issued: number; spent: number }>(
    db,
    sql`
      SELECT to_char((a.created_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(a.point) FILTER (WHERE a.point > 0), 0)::float8 AS issued,
             ${ABSOLUTE(sql`a.point < 0 AND a.action <> 'pointReversal'`)} AS spent
      FROM activities a
      WHERE ${ledgerWhere(current, timeZone)}
      GROUP BY 1
    `
  );

  const byDay = new Map<string, PointsDay>(
    eachDay(current).map((date) => [date, { date, issued: 0, spent: 0 }])
  );
  for (const row of rows) {
    const day = byDay.get(row.day);
    if (day) {
      day.issued = row.issued;
      day.spent = row.spent;
    }
  }
  return [...byDay.values()];
}

export type PointsSource = {
  source: string;
  issued: number;
  spent: number;
  users: number;
};

/** Points issued and spent by source, largest issued first. */
export async function pointsBySource(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PointsFilter
): Promise<PointsSource[]> {
  requireStaff(scope);

  return await rowsOf<PointsSource>(
    db,
    sql`
      SELECT ${SOURCE} AS source,
             COALESCE(SUM(a.point) FILTER (WHERE a.point > 0), 0)::float8 AS issued,
             ${ABSOLUTE(sql`a.point < 0 AND a.action <> 'pointReversal'`)} AS spent,
             COUNT(DISTINCT a.user_id)::int AS users
      FROM activities a
      WHERE ${ledgerWhere(filter.range.current, filter.range.timeZone)}
      GROUP BY 1
      ORDER BY issued DESC, source
    `
  );
}

const clampLimit = (limit: number | undefined): number =>
  Math.min(Math.max(Math.trunc(limit ?? 10), 1), 50);

export type PointsConcentration = {
  holders: number;
  median: number | null;
  p90: number | null;
  /** The share of all balances held by the ten largest, as a percentage. */
  top10Share: number | null;
};

type ConcentrationRow = {
  holders: number;
  median: number | null;
  p90: number | null;
  top: number;
  total: number;
};

/** How the balance is spread, over every user with at least one ledger row. */
export async function pointsConcentration(
  db: AnalyticsDb,
  scope: AnalyticsScope
): Promise<PointsConcentration> {
  requireStaff(scope);

  const [row] = await rowsOf<ConcentrationRow>(
    db,
    sql`
      WITH balances AS (
        SELECT a.user_id, COALESCE(SUM(a.point), 0)::float8 AS balance
        FROM activities a
        WHERE a.type = 'point' AND a.user_id IS NOT NULL
        GROUP BY a.user_id
      ),
      ranked AS (
        SELECT balance,
               ROW_NUMBER() OVER (ORDER BY balance DESC, user_id) AS place
        FROM balances
      )
      SELECT COUNT(*)::int AS holders,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY balance)::float8 AS median,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY balance)::float8 AS p90,
             COALESCE(SUM(balance) FILTER (WHERE place <= 10), 0)::float8 AS top,
             COALESCE(SUM(balance), 0)::float8 AS total
      FROM ranked
    `
  );

  return {
    holders: row?.holders ?? 0,
    median: row?.median ?? null,
    p90: row?.p90 ?? null,
    // A share of nothing, or of a negative total, is not a share.
    top10Share: row && row.total > 0 ? percent(row.top, row.total) : null,
  };
}

export type LeaderboardRow = {
  rank: number;
  userId: string;
  name: string | null;
  username: string | null;
  earned: number;
  balance: number;
  /** Earning events counted in `earned`. */
  events: number;
  /** The most points earned inside any one clock hour of the period. */
  peakHour: number;
  joinedAt: string | null;
  topSource: string | null;
};

/**
 * Who earned the most from activity in the period. The sign-up bonus and any
 * single grant above `LARGE_GRANT_POINTS` are left out of `earned`, so a
 * giveaway or a mispaid survey cannot decide the ranking. Balance is all-time
 * and is there to compare, never to sort by. `events` and `peakHour` show how
 * fast the points came: a script earns a large share in a single hour.
 */
export async function pointsLeaderboard(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PointsFilter & { limit?: number }
): Promise<LeaderboardRow[]> {
  requireStaff(scope);
  const limit = clampLimit(filter.limit);
  const { current, timeZone } = filter.range;

  const rows = await rowsOf<{
    rank: number;
    user_id: string;
    name: string | null;
    username: string | null;
    earned: number;
    balance: number;
    events: number;
    peak_hour: number;
    joined_at: unknown;
    top_source: string | null;
  }>(
    db,
    sql`
      WITH earned AS (
        SELECT a.user_id,
               COALESCE(SUM(a.point) FILTER (
                 WHERE a.point > 0
                   AND a.action <> 'signUp'
                   AND a.point <= ${LARGE_GRANT_POINTS}
               ), 0)::float8 AS earned,
               COUNT(*) FILTER (
                 WHERE a.point > 0
                   AND a.action <> 'signUp'
                   AND a.point <= ${LARGE_GRANT_POINTS}
               )::int AS events
        FROM activities a
        WHERE ${ledgerWhere(current, timeZone)}
          AND a.user_id IS NOT NULL
        GROUP BY a.user_id
      ),
      hourly AS (
        SELECT a.user_id, date_trunc('hour', a.created_at) AS hour,
               SUM(a.point)::float8 AS points
        FROM activities a
        WHERE ${ledgerWhere(current, timeZone)}
          AND a.user_id IS NOT NULL
          AND a.point > 0
          AND a.action <> 'signUp'
          AND a.point <= ${LARGE_GRANT_POINTS}
        GROUP BY a.user_id, 2
      ),
      peak AS (
        SELECT user_id, MAX(points)::float8 AS peak_hour
        FROM hourly
        GROUP BY user_id
      ),
      balances AS (
        SELECT a.user_id, COALESCE(SUM(a.point), 0)::float8 AS balance
        FROM activities a
        WHERE a.type = 'point'
        GROUP BY a.user_id
      ),
      earned_sources AS (
        SELECT a.user_id, ${SOURCE} AS source,
               COALESCE(SUM(a.point) FILTER (
                 WHERE a.point > 0
                   AND a.action <> 'signUp'
                   AND a.point <= ${LARGE_GRANT_POINTS}
               ), 0)::float8 AS points
        FROM activities a
        WHERE ${ledgerWhere(current, timeZone)}
          AND a.user_id IS NOT NULL
        GROUP BY a.user_id, 2
      ),
      top_source AS (
        SELECT DISTINCT ON (user_id) user_id, source
        FROM earned_sources
        WHERE points > 0
        ORDER BY user_id, points DESC, source
      )
      SELECT ROW_NUMBER() OVER (ORDER BY e.earned DESC, e.user_id)::int AS rank,
             e.user_id, u.name, u.username, e.earned,
             COALESCE(b.balance, 0)::float8 AS balance, e.events,
             COALESCE(p.peak_hour, 0)::float8 AS peak_hour,
             u.created_at AS joined_at, t.source AS top_source
      FROM earned e
      LEFT JOIN balances b ON b.user_id = e.user_id
      LEFT JOIN peak p ON p.user_id = e.user_id
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN top_source t ON t.user_id = e.user_id
      WHERE e.earned > 0
      ORDER BY earned DESC, e.user_id
      LIMIT ${limit}
    `
  );

  return rows.map((r) => ({
    rank: r.rank,
    userId: r.user_id,
    name: r.name,
    username: r.username,
    earned: r.earned,
    balance: r.balance,
    events: r.events,
    peakHour: r.peak_hour,
    joinedAt: isoOrNull(r.joined_at),
    topSource: r.top_source,
  }));
}

export type LargeGrant = {
  id: string;
  userId: string | null;
  action: string;
  source: string;
  points: number;
  at: string | null;
};

/** Single grants above the threshold, newest first. */
export async function pointsLargeGrants(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PointsFilter & { limit?: number }
): Promise<LargeGrant[]> {
  requireStaff(scope);
  const limit = clampLimit(filter.limit);

  const rows = await rowsOf<{
    id: string;
    user_id: string | null;
    action: string;
    source: string;
    points: number;
    at: unknown;
  }>(
    db,
    sql`
      SELECT a.id, a.user_id, a.action::text AS action, ${SOURCE} AS source,
             a.point::float8 AS points, a.created_at AS at
      FROM activities a
      WHERE ${ledgerWhere(filter.range.current, filter.range.timeZone)}
        AND a.point > ${LARGE_GRANT_POINTS}
      ORDER BY a.created_at DESC, a.id
      LIMIT ${limit}
    `
  );

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    action: r.action,
    source: r.source,
    points: r.points,
    at: isoOrNull(r.at),
  }));
}
