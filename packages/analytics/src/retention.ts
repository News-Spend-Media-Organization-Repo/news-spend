import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { rowsOf } from "./db";
import type { Range } from "./range";
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
