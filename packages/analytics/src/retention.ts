import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { percent, rowsOf } from "./db";
import type { Range } from "./range";
import { eachDay, inWindow } from "./range";
import type { AnalyticsScope } from "./scope";
import { requireStaff } from "./scope";

/**
 * Activation and device retention. Week labels and counts only: no report here
 * selects or returns a user id, device id or email. Events are matched to an
 * account through `news_analytics.user_id = users.id::text`.
 */

export type RetentionFilter = { range: Range; now?: Date };

const nowOf = (filter: RetentionFilter): Date => filter.now ?? new Date();

export type ActivationWeek = {
  week: string;
  signups: number;
  mature24h: number;
  activated24h: number;
  mature7d: number;
  activated7d: number;
  neverRead: number;
};

type ActivationRow = {
  week: string;
  signups: number;
  mature_24h: number;
  activated_24h: number;
  mature_7d: number;
  activated_7d: number;
};

/** Registered accounts by the Lagos week they signed up, and whether they read. */
export async function activationByWeek(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: RetentionFilter
): Promise<ActivationWeek[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<ActivationRow>(
    db,
    sql`
      WITH accounts AS (
        SELECT u.id, u.created_at,
               date_trunc('week', u.created_at AT TIME ZONE ${timeZone})::date AS week
        FROM users u
        WHERE u.is_anonymous IS NOT TRUE
          AND u.created_at >= ((${current.from}::date)::timestamp AT TIME ZONE ${timeZone})
          AND u.created_at < (((${current.to}::date + 1)::timestamp) AT TIME ZONE ${timeZone})
      )
      SELECT to_char(week, 'YYYY-MM-DD') AS week,
             COUNT(*)::int AS signups,
             COUNT(*) FILTER (
               WHERE a.created_at + interval '24 hours' <= ${nowOf(filter)}::timestamptz
             )::int AS mature_24h,
             COUNT(*) FILTER (
               WHERE a.created_at + interval '24 hours' <= ${nowOf(filter)}::timestamptz
                 AND EXISTS (
                   SELECT 1 FROM news_analytics n
                   WHERE n.user_id = a.id::text
                     AND n.event IN ('view', 'read')
                     AND n.timestamp >= a.created_at
                     AND n.timestamp <= a.created_at + interval '24 hours'
                 )
             )::int AS activated_24h,
             COUNT(*) FILTER (
               WHERE a.created_at + interval '7 days' <= ${nowOf(filter)}::timestamptz
             )::int AS mature_7d,
             COUNT(*) FILTER (
               WHERE a.created_at + interval '7 days' <= ${nowOf(filter)}::timestamptz
                 AND EXISTS (
                   SELECT 1 FROM news_analytics n
                   WHERE n.user_id = a.id::text
                     AND n.event IN ('view', 'read')
                     AND n.timestamp >= a.created_at
                     AND n.timestamp <= a.created_at + interval '7 days'
                 )
             )::int AS activated_7d
      FROM accounts a
      WHERE a.week >= ${current.from}::date AND a.week <= ${current.to}::date
      GROUP BY a.week
      ORDER BY a.week
    `
  );

  return rows.map((row) => ({
    week: row.week,
    signups: row.signups,
    mature24h: row.mature_24h,
    activated24h: row.activated_24h,
    mature7d: row.mature_7d,
    activated7d: row.activated_7d,
    neverRead: row.mature_7d - row.activated_7d,
  }));
}

export type Measure = { returned: number; eligible: number };

export type CohortRow = {
  week: string;
  devices: number;
  d1: Measure;
  w1: Measure;
  w2: Measure;
  w4: Measure;
};

type CohortSqlRow = {
  week: string;
  devices: number;
  d1_returned: number;
  d1_eligible: number;
  w1_returned: number;
  w1_eligible: number;
  w2_returned: number;
  w2_eligible: number;
  w4_returned: number;
  w4_eligible: number;
};

/**
 * New devices by the Lagos week they were first seen, and whether they came
 * back. A device is in a measure's denominator only once its whole window has
 * passed, so a young cohort shows `eligible: 0`, not a 0% rate.
 */
export async function retentionCohorts(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: RetentionFilter
): Promise<CohortRow[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<CohortSqlRow>(
    db,
    sql`
      WITH first_seen AS (
        SELECT n.device_id, MIN(n.timestamp) AS first_at
        FROM news_analytics n
        GROUP BY n.device_id
      ),
      cohorts AS (
        SELECT device_id,
               (first_at AT TIME ZONE ${timeZone})::date AS d0,
               date_trunc('week', first_at AT TIME ZONE ${timeZone})::date AS week
        FROM first_seen
      ),
      activity AS (
        SELECT DISTINCT n.device_id, (n.timestamp AT TIME ZONE ${timeZone})::date AS day
        FROM news_analytics n
      ),
      bounds AS (
        SELECT (${nowOf(filter)}::timestamptz AT TIME ZONE ${timeZone})::date AS today
      )
      SELECT to_char(c.week, 'YYYY-MM-DD') AS week,
             COUNT(*)::int AS devices,
             COUNT(*) FILTER (
               WHERE c.d0 + 1 < b.today
                 AND EXISTS (
                   SELECT 1 FROM activity a
                   WHERE a.device_id = c.device_id AND a.day = c.d0 + 1
                 )
             )::int AS d1_returned,
             COUNT(*) FILTER (WHERE c.d0 + 1 < b.today)::int AS d1_eligible,
             COUNT(*) FILTER (
               WHERE c.d0 + 7 < b.today
                 AND EXISTS (
                   SELECT 1 FROM activity a
                   WHERE a.device_id = c.device_id AND a.day BETWEEN c.d0 + 1 AND c.d0 + 7
                 )
             )::int AS w1_returned,
             COUNT(*) FILTER (WHERE c.d0 + 7 < b.today)::int AS w1_eligible,
             COUNT(*) FILTER (
               WHERE c.d0 + 14 < b.today
                 AND EXISTS (
                   SELECT 1 FROM activity a
                   WHERE a.device_id = c.device_id AND a.day BETWEEN c.d0 + 8 AND c.d0 + 14
                 )
             )::int AS w2_returned,
             COUNT(*) FILTER (WHERE c.d0 + 14 < b.today)::int AS w2_eligible,
             COUNT(*) FILTER (
               WHERE c.d0 + 28 < b.today
                 AND EXISTS (
                   SELECT 1 FROM activity a
                   WHERE a.device_id = c.device_id AND a.day BETWEEN c.d0 + 22 AND c.d0 + 28
                 )
             )::int AS w4_returned,
             COUNT(*) FILTER (WHERE c.d0 + 28 < b.today)::int AS w4_eligible
      FROM cohorts c
      CROSS JOIN bounds b
      WHERE c.week >= ${current.from}::date AND c.week <= ${current.to}::date
      GROUP BY c.week
      ORDER BY c.week
    `
  );

  return rows.map((row) => ({
    week: row.week,
    devices: row.devices,
    d1: { returned: row.d1_returned, eligible: row.d1_eligible },
    w1: { returned: row.w1_returned, eligible: row.w1_eligible },
    w2: { returned: row.w2_returned, eligible: row.w2_eligible },
    w4: { returned: row.w4_returned, eligible: row.w4_eligible },
  }));
}

export type ActiveDay = { date: string; devices: number };

/** Distinct active devices on each Lagos day of the period, zero-filled. */
export async function activeDevicesDaily(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: RetentionFilter
): Promise<ActiveDay[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<{ day: string; devices: number }>(
    db,
    sql`
      SELECT to_char((n.timestamp AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             COUNT(DISTINCT n.device_id)::int AS devices
      FROM news_analytics n
      WHERE ${inWindow(sql`n.timestamp`, current, timeZone)}
      GROUP BY 1
    `
  );

  const byDay = new Map<string, ActiveDay>(
    eachDay(current).map((date) => [date, { date, devices: 0 }])
  );
  for (const row of rows) {
    const day = byDay.get(row.day);
    if (day) {
      day.devices = row.devices;
    }
  }
  return [...byDay.values()];
}

export type Stickiness = {
  wau: number;
  mau: number;
  avgDau30: number;
  stickiness: number | null;
};

type SummaryRow = { wau: number; mau: number; avg_dau_30: number };

const summaryFor = async (
  db: AnalyticsDb,
  timeZone: string,
  asOf: string
): Promise<Stickiness> => {
  const [row] = await rowsOf<SummaryRow>(
    db,
    sql`
      SELECT (
               SELECT COUNT(DISTINCT n.device_id)::int
               FROM news_analytics n
               WHERE (n.timestamp AT TIME ZONE ${timeZone})::date
                 BETWEEN ${asOf}::date - 6 AND ${asOf}::date
             ) AS wau,
             (
               SELECT COUNT(DISTINCT n.device_id)::int
               FROM news_analytics n
               WHERE (n.timestamp AT TIME ZONE ${timeZone})::date
                 BETWEEN ${asOf}::date - 29 AND ${asOf}::date
             ) AS mau,
             (
               SELECT COUNT(*)::float8
               FROM (
                 SELECT DISTINCT n.device_id, (n.timestamp AT TIME ZONE ${timeZone})::date AS day
                 FROM news_analytics n
                 WHERE (n.timestamp AT TIME ZONE ${timeZone})::date
                   BETWEEN ${asOf}::date - 29 AND ${asOf}::date
               ) active
             ) / 30 AS avg_dau_30
    `
  );

  return {
    wau: row?.wau ?? 0,
    mau: row?.mau ?? 0,
    avgDau30: Math.round((row?.avg_dau_30 ?? 0) * 10) / 10,
    stickiness: percent(row?.avg_dau_30 ?? 0, row?.mau ?? 0),
  };
};

/** WAU, MAU and stickiness as of the last day of each window. */
export async function activeDevicesSummary(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: RetentionFilter
): Promise<{ current: Stickiness; previous: Stickiness }> {
  requireStaff(scope);
  const { timeZone, current, previous } = filter.range;

  const [currentWindow, previousWindow] = await Promise.all([
    summaryFor(db, timeZone, current.to),
    summaryFor(db, timeZone, previous.to),
  ]);

  return { current: currentWindow, previous: previousWindow };
}
