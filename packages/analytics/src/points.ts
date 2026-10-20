import type { SQL } from "@payloadcms/db-postgres/drizzle";
import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { rowsOf } from "./db";
import type { DateWindow, Range } from "./range";
import { eachDay, inWindow } from "./range";
import type { AnalyticsScope } from "./scope";
import { requireStaff } from "./scope";

/**
 * The Dream Points economy: the `activities` rows of type `point`.
 *
 * Privacy exception: unlike the rest of this package, the leaderboard and the
 * large-grants panel carry a user id. It is used only as the target of the
 * admin's own "Open account" link. A name, email or username is never selected
 * or shown.
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
