import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { isoOrNull, percent, rowsOf } from "./db";
import type { Range } from "./range";
import { inWindow } from "./range";
import type { AnalyticsScope } from "./scope";
import { requireStaff } from "./scope";

/**
 * Work waiting on someone, and how push campaigns fared.
 *
 * Everything here is *observed*: counts of rows the server (or a provider
 * webhook it recorded) created. Staff only. Nothing here names a reader.
 */

export type AttentionFilter = {
  /**
   * What "now" is, for the trailing-7-day counts. Defaults to the real clock;
   * tests pass a fixed one.
   */
  now?: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export type AttentionCounts = {
  /** Comments held for review. */
  commentsHidden: number;
  /** Content reports nobody has resolved or dismissed. */
  reportsPending: number;
  /**
   * Identity checks the provider wants a human to look at. Checks the
   * provider is still working through ("In Progress") are not waiting on us
   * and are left out.
   */
  identityInReview: number;
  /**
   * Giveaway accounts flagged suspicious that no administrator has reviewed.
   * A suspicious account still takes part but any prize it wins is held for
   * review, so these are waiting on a person. Accounts already disqualified
   * are decided, and those marked ok are cleared: neither is counted.
   */
  flagsUnreviewed: number;
  /** Push deliveries that failed in the last 7 days. */
  pushFailed: number;
  /**
   * Witness reports in the last 7 days. Witness reports have no status field,
   * so this is a count to glance at, not a queue to work down.
   */
  witnessWeek: number;
};

export async function needsAttention(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: AttentionFilter = {}
): Promise<AttentionCounts> {
  requireStaff(scope);
  const since = new Date(
    (filter.now ?? new Date()).getTime() - 7 * DAY_MS
  ).toISOString();

  const [row] = await rowsOf<{
    comments_hidden: number;
    reports_pending: number;
    identity_in_review: number;
    flags_unreviewed: number;
    push_failed: number;
    witness_week: number;
  }>(
    db,
    sql`
      SELECT (SELECT COUNT(*)::int FROM comments
               WHERE moderation_status = 'hidden') AS comments_hidden,
             (SELECT COUNT(*)::int FROM content_reports
               WHERE status = 'pending') AS reports_pending,
             (SELECT COUNT(*)::int FROM identity_checks
               WHERE status = 'In Review') AS identity_in_review,
             (SELECT COUNT(*)::int FROM giveaway_account_flags
               WHERE trust_status = 'suspicious'
                 AND reviewed_by_id IS NULL) AS flags_unreviewed,
             (SELECT COUNT(*)::int FROM notification_deliveries
               WHERE status = 'failed'
                 AND created_at >= ${since}::timestamptz) AS push_failed,
             (SELECT COUNT(*)::int FROM witness_reports
               WHERE created_at >= ${since}::timestamptz) AS witness_week
    `
  );

  return {
    commentsHidden: row?.comments_hidden ?? 0,
    reportsPending: row?.reports_pending ?? 0,
    identityInReview: row?.identity_in_review ?? 0,
    flagsUnreviewed: row?.flags_unreviewed ?? 0,
    pushFailed: row?.push_failed ?? 0,
    witnessWeek: row?.witness_week ?? 0,
  };
}

export type PushCampaign = {
  id: string;
  title: string | null;
  sentAt: string | null;
  delivered: number;
  opened: number;
  failed: number;
  /** Delivery rows of any status. */
  total: number;
  /** Opened per delivery, as a percentage. */
  openedRate: number | null;
};

export type PushReport = {
  totals: {
    campaigns: number;
    delivered: number;
    opened: number;
    failed: number;
    openedRate: number | null;
    failedRate: number | null;
  };
  campaigns: PushCampaign[];
};

/**
 * Push campaigns sent in the period, with delivery outcomes.
 *
 * The per-campaign totals live only as virtual fields, so they are counted
 * here from the delivery rows. "Opened" is its own final state, not a subset of
 * "delivered".
 *
 * Delivered and failed come from the push provider's receipts. **Opened is
 * reported by the app**: the `trackOpen` endpoint is public and sets the
 * status. It is real but not confirmed, and the panel says so.
 *
 * `campaigns` lists the latest few, but `totals` cover every campaign sent in
 * the period, from a query of their own.
 */
export async function pushReport(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: { range: Range; limit?: number }
): Promise<PushReport> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;
  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 10), 1), 50);

  const [rows, [all]] = await Promise.all([
    rowsOf<{
      id: string;
      title: string | null;
      sent_at: unknown;
      delivered: number;
      opened: number;
      failed: number;
      total: number;
    }>(
      db,
      sql`
      SELECT n.id, n.title, n.sent_at,
             COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered,
             COUNT(*) FILTER (WHERE d.status = 'opened')::int AS opened,
             COUNT(*) FILTER (WHERE d.status = 'failed')::int AS failed,
             COUNT(d.id)::int AS total
      FROM notifications n
      LEFT JOIN notification_deliveries d ON d.notification_id = n.id
      WHERE ${inWindow(sql.raw("n.sent_at"), current, timeZone)}
      GROUP BY n.id
      ORDER BY n.sent_at DESC, n.id
      LIMIT ${limit}
    `
    ),
    rowsOf<{
      campaigns: number;
      delivered: number;
      opened: number;
      failed: number;
      total: number;
    }>(
      db,
      sql`
        SELECT COUNT(DISTINCT n.id)::int AS campaigns,
               COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered,
               COUNT(*) FILTER (WHERE d.status = 'opened')::int AS opened,
               COUNT(*) FILTER (WHERE d.status = 'failed')::int AS failed,
               COUNT(d.id)::int AS total
        FROM notifications n
        LEFT JOIN notification_deliveries d ON d.notification_id = n.id
        WHERE ${inWindow(sql.raw("n.sent_at"), current, timeZone)}
      `
    ),
  ]);

  const campaigns: PushCampaign[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    sentAt: isoOrNull(r.sent_at),
    delivered: r.delivered,
    opened: r.opened,
    failed: r.failed,
    total: r.total,
    openedRate: percent(r.opened, r.total),
  }));

  const total = all?.total ?? 0;
  return {
    totals: {
      campaigns: all?.campaigns ?? 0,
      delivered: all?.delivered ?? 0,
      opened: all?.opened ?? 0,
      failed: all?.failed ?? 0,
      openedRate: percent(all?.opened ?? 0, total),
      failedRate: percent(all?.failed ?? 0, total),
    },
    campaigns,
  };
}
