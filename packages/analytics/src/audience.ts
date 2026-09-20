import type { SQL } from "@payloadcms/db-postgres/drizzle";
import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { percent, rowsOf } from "./db";
import type { Range } from "./range";
import { eachDay, inWindow } from "./range";
import type { AnalyticsScope } from "./scope";
import { requireStaff } from "./scope";

/**
 * The audience: who has an account, who uses it, and what they say.
 *
 * Everything here is *observed*: rows the server created or updated (users,
 * push tokens, feedback records). The one exception is any readers figure
 * derived from `news_analytics`, which is app-reported and lives in `news.ts`,
 * not here.
 *
 * Staff only. Nothing here names a reader: every figure is a count, an
 * average, or a group label.
 */

export type AudienceFilter = {
  range: Range;
  /**
   * What "now" is, for the active-users and guest snapshots. Defaults to the
   * real clock; tests pass a fixed one.
   */
  now?: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export type AudienceSummary = {
  /** Registered accounts, ever. */
  registered: number;
  /** New registrations in the period and the one before it. */
  newUsers: { current: number; previous: number };
  /** Registered and active in the last 7 days, now. */
  active7: number;
  /** Registered and active in the last 30 days, now. */
  active30: number;
  /**
   * Registered accounts whose email address is verified. `users._verified` is
   * the auth library's `emailVerified`, so this says nothing about identity
   * checks (those are `identity_checks`, and `verified_country`).
   */
  emailVerified: number;
  /** Email-verified per registered account, as a percentage. */
  emailVerifiedRate: number | null;
  /** Registered accounts with at least one active push token. */
  pushEnabled: number;
  /** Push-enabled per registered account, as a percentage. */
  pushRate: number | null;
  /**
   * Guest accounts right now. A snapshot only: a daily job deletes guests
   * older than a day, so a trend would count deletions as departures.
   */
  guests: number;
};

export async function audienceSummary(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: AudienceFilter
): Promise<AudienceSummary> {
  requireStaff(scope);
  const { timeZone, current, previous } = filter.range;
  const now = filter.now ?? new Date();
  const active7Since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const active30Since = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  const [counts] = await rowsOf<{
    registered: number;
    new_current: number;
    new_previous: number;
    active7: number;
    active30: number;
    email_verified: number;
    push_enabled: number;
    guests: number;
  }>(
    db,
    sql`
      SELECT COUNT(*) FILTER (WHERE COALESCE(u.is_anonymous, FALSE) = FALSE)::int AS registered,
             COUNT(*) FILTER (WHERE COALESCE(u.is_anonymous, FALSE) = FALSE
               AND ${inWindow(sql.raw("u.created_at"), current, timeZone)})::int AS new_current,
             COUNT(*) FILTER (WHERE COALESCE(u.is_anonymous, FALSE) = FALSE
               AND ${inWindow(sql.raw("u.created_at"), previous, timeZone)})::int AS new_previous,
             COUNT(*) FILTER (WHERE COALESCE(u.is_anonymous, FALSE) = FALSE
               AND u.last_active >= ${active7Since}::timestamptz)::int AS active7,
             COUNT(*) FILTER (WHERE COALESCE(u.is_anonymous, FALSE) = FALSE
               AND u.last_active >= ${active30Since}::timestamptz)::int AS active30,
             COUNT(*) FILTER (WHERE COALESCE(u.is_anonymous, FALSE) = FALSE
               AND COALESCE(u._verified, FALSE) = TRUE)::int AS email_verified,
             COUNT(*) FILTER (WHERE COALESCE(u.is_anonymous, FALSE) = FALSE
               AND EXISTS (SELECT 1 FROM push_tokens t
                           WHERE t.user_id = u.id AND t.status = 'active'))::int AS push_enabled,
             COUNT(*) FILTER (WHERE COALESCE(u.is_anonymous, FALSE) = TRUE)::int AS guests
      FROM users u
    `
  );

  const registered = counts?.registered ?? 0;
  const emailVerified = counts?.email_verified ?? 0;
  const pushEnabled = counts?.push_enabled ?? 0;
  return {
    registered,
    newUsers: {
      current: counts?.new_current ?? 0,
      previous: counts?.new_previous ?? 0,
    },
    active7: counts?.active7 ?? 0,
    active30: counts?.active30 ?? 0,
    emailVerified,
    emailVerifiedRate: percent(emailVerified, registered),
    pushEnabled,
    pushRate: percent(pushEnabled, registered),
    guests: counts?.guests ?? 0,
  };
}

export type AudienceDay = { date: string; newUsers: number };

/** New registered accounts for each day of the period, zeros included. */
export async function audienceDaily(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: AudienceFilter
): Promise<AudienceDay[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<{ day: string; n: number }>(
    db,
    sql`
      SELECT to_char((u.created_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS n
      FROM users u
      WHERE COALESCE(u.is_anonymous, FALSE) = FALSE
        AND ${inWindow(sql.raw("u.created_at"), current, timeZone)}
      GROUP BY 1
    `
  );

  const byDay = new Map<string, AudienceDay>(
    eachDay(current).map((date) => [date, { date, newUsers: 0 }])
  );
  for (const row of rows) {
    const day = byDay.get(row.day);
    if (day) {
      day.newUsers = row.n;
    }
  }
  return [...byDay.values()];
}

export type DeviceBreakdown = { label: string; tokens: number };

function deviceGroup(column: SQL): SQL {
  // Cast first: COALESCE would otherwise resolve the literal to the column's
  // enum type, and 'unknown' is not a valid enum value.
  return sql`COALESCE(${column}::text, 'unknown')`;
}

/** Active push tokens by device type and by app version. */
export async function audienceDevices(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: AudienceFilter
): Promise<{
  byType: DeviceBreakdown[];
  byVersion: DeviceBreakdown[];
}> {
  requireStaff(scope);

  const [byType, byVersion] = await Promise.all([
    rowsOf<{ label: string; tokens: number }>(
      db,
      sql`
        SELECT ${deviceGroup(sql.raw("t.device_type"))} AS label,
               COUNT(*)::int AS tokens
        FROM push_tokens t
        WHERE t.status = 'active'
        GROUP BY 1
        ORDER BY tokens DESC, label
      `
    ),
    rowsOf<{ label: string; tokens: number }>(
      db,
      sql`
        SELECT ${deviceGroup(sql.raw("t.app_version"))} AS label,
               COUNT(*)::int AS tokens
        FROM push_tokens t
        WHERE t.status = 'active'
        GROUP BY 1
        ORDER BY tokens DESC, label
      `
    ),
  ]);
  return { byType, byVersion };
}

export type CountryBreakdown = { country: string; users: number };

/**
 * Registered users by country. The checked identity-document country wins
 * where set; the self-reported one fills the rest. Anything neither gives is
 * grouped as unknown rather than dropped.
 */
export async function audienceCountries(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: AudienceFilter & { limit?: number }
): Promise<CountryBreakdown[]> {
  requireStaff(scope);
  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 10), 1), 50);

  return await rowsOf<CountryBreakdown>(
    db,
    sql`
      SELECT COALESCE(NULLIF(u.verified_country, ''), NULLIF(u.country, ''), 'unknown') AS country,
             COUNT(*)::int AS users
      FROM users u
      WHERE COALESCE(u.is_anonymous, FALSE) = FALSE
      GROUP BY 1
      ORDER BY users DESC, country
      LIMIT ${limit}
    `
  );
}

export type FeedbackSummary = {
  /** Average rating over the period, or null when there is no feedback. */
  average: number | null;
  total: number;
  byType: { type: string; count: number; average: number | null }[];
};

/** What readers say: average rating and counts by feedback type. */
export async function feedbackSummary(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: AudienceFilter
): Promise<FeedbackSummary> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<{
    type: string;
    count: number;
    average: number | null;
  }>(
    db,
    sql`
      SELECT COALESCE(f.type::text, 'unknown') AS type,
             COUNT(*)::int AS count,
             AVG(f.rating)::float8 AS average
      FROM feedback f
      WHERE ${inWindow(sql.raw("f.created_at"), current, timeZone)}
      GROUP BY 1
      ORDER BY count DESC, type
    `
  );

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const weighted = rows.reduce(
    (sum, r) => sum + Number(r.average ?? 0) * r.count,
    0
  );
  return {
    average: total === 0 ? null : Math.round((weighted / total) * 10) / 10,
    total,
    byType: rows.map((r) => ({
      type: r.type,
      count: r.count,
      average:
        r.average === null ? null : Math.round(Number(r.average) * 10) / 10,
    })),
  };
}
