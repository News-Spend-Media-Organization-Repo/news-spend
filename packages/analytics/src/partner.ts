import type { SQL } from "@payloadcms/db-postgres/drizzle";
import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { assertUuid, isoOrNull, percent, rowsOf } from "./db";
import type { DateWindow, Range } from "./range";
import { eachDay, inWindow } from "./range";
import type { AnalyticsScope } from "./scope";
import { partnerFilter, requireStaff } from "./scope";

/**
 * How a partner's placement performs.
 *
 * Two kinds of number, kept apart because they are not equally trustworthy:
 *
 * - **Observed** (`conversions`): rows the server created when a reader was
 *   sent to the partner and updated when the partner's postback arrived. The
 *   app cannot fake these.
 * - **Reported** (`shop`): views and clicks in the shop tab, sent by the app.
 *
 * A partner sees only their own; staff see one partner or all. Nothing here
 * returns which reader did what: a partner is told how many, and how it went,
 * never who.
 */

export type PartnerFilter = {
  range: Range;
  /**
   * Staff only: limit to one partner. A partner is always limited to their own
   * whatever this says, and naming anyone else is an error.
   */
  partnerId?: string;
};

/**
 * `AND`-ready condition limiting `column` to the resolved partner, or nothing
 * for staff looking at every partner.
 */
function partnerCondition(column: SQL, partnerId: string | undefined): SQL {
  return partnerId === undefined
    ? sql``
    : sql`AND ${column} = ${assertUuid(partnerId, "partnerId")}::uuid`;
}

export type ConversionOutcomes = {
  /** Reader sent to the partner. */
  clicks: number;
  /** Sent, and the partner has not reported back. */
  waiting: number;
  /** Converted, points not yet awarded. */
  pending: number;
  awarded: number;
  failed: number;
  /** Converted or awarded. */
  conversions: number;
  pointsAwarded: number;
  /** Conversions per click, as a percentage. */
  conversionRate: number | null;
};

async function outcomesFor(
  db: AnalyticsDb,
  partnerId: string | undefined,
  window: DateWindow,
  timeZone: string
): Promise<ConversionOutcomes> {
  const [row] = await rowsOf<{
    clicks: number;
    waiting: number;
    pending: number;
    awarded: number;
    failed: number;
    points: number;
  }>(
    db,
    sql`
      SELECT COUNT(*)::int AS clicks,
             COUNT(*) FILTER (WHERE pc.status = 'clicked')::int AS waiting,
             COUNT(*) FILTER (WHERE pc.status = 'converted')::int AS pending,
             COUNT(*) FILTER (WHERE pc.status = 'awarded')::int AS awarded,
             COUNT(*) FILTER (WHERE pc.status = 'failed')::int AS failed,
             COALESCE(SUM(pc.points_awarded) FILTER (WHERE pc.status = 'awarded'), 0)::float8 AS points
      FROM partner_conversions pc
      WHERE ${inWindow(sql.raw("pc.clicked_at"), window, timeZone)}
        ${partnerCondition(sql.raw("pc.partner_id"), partnerId)}
    `
  );

  const clicks = row?.clicks ?? 0;
  const pending = row?.pending ?? 0;
  const awarded = row?.awarded ?? 0;
  return {
    clicks,
    waiting: row?.waiting ?? 0,
    pending,
    awarded,
    failed: row?.failed ?? 0,
    conversions: pending + awarded,
    pointsAwarded: Number(row?.points ?? 0),
    conversionRate: percent(pending + awarded, clicks),
  };
}

async function shopFor(
  db: AnalyticsDb,
  partnerId: string | undefined,
  window: DateWindow,
  timeZone: string
): Promise<{ views: number; clicks: number }> {
  const [row] = await rowsOf<{ views: number; clicks: number }>(
    db,
    sql`
      SELECT COUNT(*) FILTER (WHERE s.type = 'view')::int AS views,
             COUNT(*) FILTER (WHERE s.type = 'click')::int AS clicks
      FROM shop_analytics s
      WHERE ${inWindow(sql.raw("s.timestamp"), window, timeZone)}
        ${partnerCondition(sql.raw("s.store_id"), partnerId)}
    `
  );
  return { views: row?.views ?? 0, clicks: row?.clicks ?? 0 };
}

/**
 * Where the clicks made in the period ended up, and the same for the period
 * before. Counted by when the reader clicked, so a click late in the period
 * that converts tomorrow will show as converted then.
 */
export async function partnerSummary(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PartnerFilter
): Promise<{
  /** Observed. */
  conversions: { current: ConversionOutcomes; previous: ConversionOutcomes };
  /** Reported by the app. */
  shop: {
    current: { views: number; clicks: number };
    previous: { views: number; clicks: number };
  };
}> {
  const partnerId = partnerFilter(scope, filter.partnerId);
  const { timeZone, current, previous } = filter.range;

  const [conversionsNow, conversionsBefore, shopNow, shopBefore] =
    await Promise.all([
      outcomesFor(db, partnerId, current, timeZone),
      outcomesFor(db, partnerId, previous, timeZone),
      shopFor(db, partnerId, current, timeZone),
      shopFor(db, partnerId, previous, timeZone),
    ]);

  return {
    conversions: { current: conversionsNow, previous: conversionsBefore },
    shop: { current: shopNow, previous: shopBefore },
  };
}

export type PartnerDay = { date: string; clicks: number; conversions: number };

/**
 * Clicks and conversions for each day of the period. Each is counted on its
 * own day: a click on the day it happened, a conversion on the day the partner
 * reported it.
 */
export async function partnerDaily(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PartnerFilter
): Promise<PartnerDay[]> {
  const partnerId = partnerFilter(scope, filter.partnerId);
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<{
    day: string;
    kind: "click" | "conversion";
    n: number;
  }>(
    db,
    sql`
      SELECT to_char((pc.clicked_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             'click' AS kind, COUNT(*)::int AS n
      FROM partner_conversions pc
      WHERE ${inWindow(sql.raw("pc.clicked_at"), current, timeZone)}
        ${partnerCondition(sql.raw("pc.partner_id"), partnerId)}
      GROUP BY 1
      UNION ALL
      SELECT to_char((pc.converted_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             'conversion' AS kind, COUNT(*)::int AS n
      FROM partner_conversions pc
      WHERE pc.status IN ('converted', 'awarded')
        AND ${inWindow(sql.raw("pc.converted_at"), current, timeZone)}
        ${partnerCondition(sql.raw("pc.partner_id"), partnerId)}
      GROUP BY 1
    `
  );

  const byDay = new Map<string, PartnerDay>(
    eachDay(current).map((date) => [date, { date, clicks: 0, conversions: 0 }])
  );
  for (const row of rows) {
    const day = byDay.get(row.day);
    if (day) {
      if (row.kind === "click") {
        day.clicks = row.n;
      } else {
        day.conversions = row.n;
      }
    }
  }
  return [...byDay.values()];
}

export type RecentConversion = {
  clickId: string;
  status: string;
  pointsAwarded: number;
  partnerOrderId: string | null;
  /** The partner's name, so staff looking at every partner can tell rows apart. */
  partnerName: string | null;
  content: string | null;
  clickedAt: string | null;
  convertedAt: string | null;
  awardedAt: string | null;
};

/**
 * The latest conversion activity, newest first.
 *
 * Deliberately has no reader in it: not an id, not a name. A partner gets the
 * partner's own order reference and click id, which they already hold, and
 * nothing that identifies one of our readers.
 */
export async function partnerRecentConversions(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: Omit<PartnerFilter, "range"> & { limit?: number }
): Promise<RecentConversion[]> {
  const partnerId = partnerFilter(scope, filter.partnerId);
  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 10), 1), 50);

  const rows = await rowsOf<{
    click_id: string;
    status: string;
    points_awarded: number | null;
    partner_order_id: string | null;
    partner_name: string | null;
    content: string | null;
    clicked_at: unknown;
    converted_at: unknown;
    awarded_at: unknown;
  }>(
    db,
    sql`
      SELECT pc.click_id, pc.status::text AS status, pc.points_awarded::float8 AS points_awarded,
             pc.partner_order_id, p.company_name AS partner_name, c.title AS content,
             pc.clicked_at, pc.converted_at, pc.awarded_at
      FROM partner_conversions pc
      LEFT JOIN partners p ON p.id = pc.partner_id
      LEFT JOIN partner_content c ON c.id = pc.content_id
      WHERE TRUE ${partnerCondition(sql.raw("pc.partner_id"), partnerId)}
      ORDER BY COALESCE(pc.awarded_at, pc.converted_at, pc.clicked_at) DESC, pc.id
      LIMIT ${limit}
    `
  );

  return rows.map((r) => ({
    clickId: r.click_id,
    status: r.status,
    pointsAwarded: Number(r.points_awarded ?? 0),
    partnerOrderId: r.partner_order_id,
    partnerName: r.partner_name,
    content: r.content,
    clickedAt: isoOrNull(r.clicked_at),
    convertedAt: isoOrNull(r.converted_at),
    awardedAt: isoOrNull(r.awarded_at),
  }));
}

export type PostbackHealth = {
  /** Postbacks that named a real click, in the period. */
  total: number;
  /** Accepted, and the conversion settled. */
  accepted: number;
  /** The partner itself reported the task failed. */
  failedReported: number;
  /** A repeat of one already processed. */
  duplicate: number;
  /** Refused because they could not be verified. */
  rejected: number;
  /** Rejected per postback, as a percentage. */
  rejectedRate: number | null;
  /**
   * The latest postback we have ever recorded from the partner (or from any
   * partner, for staff), regardless of the period: "nothing for a month" is the
   * signal, and it should not vanish when the period is short.
   */
  lastReceivedAt: string | null;
  /** Why they were rejected, from our own verification, most common first. */
  rejectedReasons: { reason: string; count: number }[];
};

/**
 * How a partner's postbacks are being received.
 *
 * A partner whose signing has broken looks exactly like a partner with no
 * conversions, since a refused postback used to leave only a log line. This is
 * what tells the two apart. Observed: rows the server wrote as it handled each
 * one. Only postbacks naming a real click are here, because only those can be
 * attributed. Nothing identifies a reader.
 */
export async function partnerPostbackHealth(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PartnerFilter
): Promise<PostbackHealth> {
  const partnerId = partnerFilter(scope, filter.partnerId);
  const { timeZone, current } = filter.range;
  const owner = partnerCondition(sql.raw("p.partner_id"), partnerId);

  const [counts, last, reasons] = await Promise.all([
    rowsOf<{
      total: number;
      accepted: number;
      failed_reported: number;
      duplicate: number;
      rejected: number;
    }>(
      db,
      sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE p.outcome = 'accepted')::int AS accepted,
               COUNT(*) FILTER (WHERE p.outcome = 'failed_reported')::int AS failed_reported,
               COUNT(*) FILTER (WHERE p.outcome = 'duplicate')::int AS duplicate,
               COUNT(*) FILTER (WHERE p.outcome = 'rejected')::int AS rejected
        FROM partner_postbacks p
        WHERE ${inWindow(sql.raw("p.received_at"), current, timeZone)}
          ${owner}
      `
    ),
    rowsOf<{ last_received: unknown }>(
      db,
      sql`SELECT MAX(p.received_at) AS last_received
          FROM partner_postbacks p
          WHERE TRUE ${owner}`
    ),
    rowsOf<{ reason: string | null; n: number }>(
      db,
      sql`
        SELECT p.reason, COUNT(*)::int AS n
        FROM partner_postbacks p
        WHERE p.outcome = 'rejected'
          AND ${inWindow(sql.raw("p.received_at"), current, timeZone)}
          ${owner}
        GROUP BY p.reason
        ORDER BY n DESC, p.reason
        LIMIT 5
      `
    ),
  ]);

  const row = counts[0];
  const total = row?.total ?? 0;
  const rejected = row?.rejected ?? 0;
  return {
    total,
    accepted: row?.accepted ?? 0,
    failedReported: row?.failed_reported ?? 0,
    duplicate: row?.duplicate ?? 0,
    rejected,
    rejectedRate: percent(rejected, total),
    lastReceivedAt: isoOrNull(last[0]?.last_received),
    rejectedReasons: reasons.map((r) => ({
      reason: r.reason ?? "no reason recorded",
      count: r.n,
    })),
  };
}

/**
 * Impressions and taps on partner content, as the app reported them.
 *
 * Reported, not observed: the app sends these. Counts are per item and
 * surface; a reader is only ever counted, never named. Session and device
 * columns appear only inside COUNT(DISTINCT ...) and join conditions, never as
 * output columns.
 */
export type PartnerEventsFilter = PartnerFilter & { contentId?: string };

/**
 * `impressions` and `taps` are raw row counts (every click counts).
 * `sessionsSeen` is distinct sessions with an impression; `sessionsTapped` is
 * distinct sessions with a tap that also saw the item in the same window, so
 * `tapThrough` cannot exceed 100. The session counts are per item per surface:
 * in a total over several items or surfaces they are summed across those
 * pairs, so one session that saw two items counts once for each.
 */
export type EventTotals = {
  impressions: number;
  taps: number;
  sessionsSeen: number;
  sessionsTapped: number;
  tapThrough: number | null;
};

export const OUTLIER_TAP_THROUGH = 50;
export const OUTLIER_MIN_SESSIONS = 50;

type PairRow = {
  content_id: string;
  partner_id: string;
  surface: string;
  impressions: number;
  taps: number;
  sessions_seen: number;
  sessions_tapped: number;
};

function totalsOf(row: {
  impressions?: number | string | null;
  taps?: number | string | null;
  sessions_seen?: number | string | null;
  sessions_tapped?: number | string | null;
}): EventTotals {
  const sessionsSeen = Number(row.sessions_seen ?? 0);
  const sessionsTapped = Number(row.sessions_tapped ?? 0);
  return {
    impressions: Number(row.impressions ?? 0),
    taps: Number(row.taps ?? 0),
    sessionsSeen,
    sessionsTapped,
    tapThrough: percent(sessionsTapped, sessionsSeen),
  };
}

/** `AND`-ready condition limiting events to one content item, or nothing. */
function contentCondition(contentId: string | undefined): SQL {
  return contentId === undefined
    ? sql``
    : sql`AND e.content_id = ${assertUuid(contentId, "contentId")}::uuid`;
}

/**
 * One row per (content, partner, surface) with events in the window.
 *
 * The events are read once (`ev`, where the window, partner and content limits
 * are applied) and everything else derives from that. `seen` is the distinct
 * sessions with an impression; a tapped session is a distinct clicking session
 * joined to `seen` on the same content, partner, surface and session, so it
 * had an impression of that item on that surface in the same window and
 * `sessions_tapped` can never exceed `sessions_seen`.
 */
function pairsQuery(
  window: DateWindow,
  timeZone: string,
  partnerId: string | undefined,
  contentId: string | undefined
): SQL {
  return sql`
    WITH ev AS (
      SELECT e.content_id, e.partner_id, e.surface, e.event, e.session_id
      FROM partner_content_events e
      WHERE ${inWindow(sql.raw("e.timestamp"), window, timeZone)}
        ${partnerCondition(sql.raw("e.partner_id"), partnerId)}
        ${contentCondition(contentId)}
    ),
    seen AS (
      SELECT DISTINCT content_id, partner_id, surface, session_id
      FROM ev WHERE event = 'impression'
    ),
    seen_n AS (
      SELECT content_id, partner_id, surface, COUNT(*)::int AS n
      FROM seen GROUP BY content_id, partner_id, surface
    ),
    tapped_n AS (
      SELECT c.content_id, c.partner_id, c.surface, COUNT(*)::int AS n
      FROM (
        SELECT DISTINCT content_id, partner_id, surface, session_id
        FROM ev WHERE event = 'click'
      ) c
      JOIN seen s ON s.content_id = c.content_id AND s.partner_id = c.partner_id
        AND s.surface = c.surface AND s.session_id = c.session_id
      GROUP BY c.content_id, c.partner_id, c.surface
    ),
    raw AS (
      SELECT content_id, partner_id, surface,
             COUNT(*) FILTER (WHERE event = 'impression')::int AS impressions,
             COUNT(*) FILTER (WHERE event = 'click')::int AS taps
      FROM ev GROUP BY content_id, partner_id, surface
    )
    SELECT r.content_id, r.partner_id, r.surface, r.impressions, r.taps,
           COALESCE(sn.n, 0)::int AS sessions_seen,
           COALESCE(tn.n, 0)::int AS sessions_tapped
    FROM raw r
    LEFT JOIN seen_n sn ON sn.content_id = r.content_id
      AND sn.partner_id = r.partner_id AND sn.surface = r.surface
    LEFT JOIN tapped_n tn ON tn.content_id = r.content_id
      AND tn.partner_id = r.partner_id AND tn.surface = r.surface`;
}

async function eventTotalsFor(
  db: AnalyticsDb,
  partnerId: string | undefined,
  contentId: string | undefined,
  window: DateWindow,
  timeZone: string
): Promise<EventTotals> {
  const rows = await rowsOf<PairRow>(
    db,
    pairsQuery(window, timeZone, partnerId, contentId)
  );
  const sum = { impressions: 0, taps: 0, sessions_seen: 0, sessions_tapped: 0 };
  for (const row of rows) {
    sum.impressions += Number(row.impressions);
    sum.taps += Number(row.taps);
    sum.sessions_seen += Number(row.sessions_seen);
    sum.sessions_tapped += Number(row.sessions_tapped);
  }
  return totalsOf(sum);
}

export async function partnerEventsSummary(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PartnerEventsFilter
): Promise<{ current: EventTotals; previous: EventTotals }> {
  const partnerId = partnerFilter(scope, filter.partnerId);
  const { timeZone, current, previous } = filter.range;
  const [now, before] = await Promise.all([
    eventTotalsFor(db, partnerId, filter.contentId, current, timeZone),
    eventTotalsFor(db, partnerId, filter.contentId, previous, timeZone),
  ]);
  return { current: now, previous: before };
}

export type ItemSurfaceRow = {
  contentId: string;
  title: string | null;
  surface: string;
} & EventTotals;

/** Each item on each surface, most seen first. */
export async function partnerEventsByItem(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PartnerEventsFilter
): Promise<ItemSurfaceRow[]> {
  const partnerId = partnerFilter(scope, filter.partnerId);
  const { timeZone, current } = filter.range;
  const rows = await rowsOf<PairRow & { title: string | null }>(
    db,
    sql`
      SELECT t.*, c.title
      FROM (${pairsQuery(current, timeZone, partnerId, filter.contentId)}) t
      LEFT JOIN partner_content c ON c.id = t.content_id
      ORDER BY t.impressions DESC, t.content_id, t.surface
      LIMIT 200
    `
  );
  return rows.map((r) => ({
    contentId: r.content_id,
    title: r.title,
    surface: r.surface,
    ...totalsOf(r),
  }));
}

export type EventsDay = {
  date: string;
  surface: string;
  impressions: number;
  taps: number;
};

/** Impressions and taps per day for each surface that has any, zero-filled. */
export async function partnerEventsDaily(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: PartnerEventsFilter
): Promise<EventsDay[]> {
  const partnerId = partnerFilter(scope, filter.partnerId);
  const { timeZone, current } = filter.range;
  const rows = await rowsOf<{
    day: string;
    surface: string;
    impressions: number;
    taps: number;
  }>(
    db,
    sql`
      SELECT to_char((e.timestamp AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             e.surface,
             COUNT(*) FILTER (WHERE e.event = 'impression')::int AS impressions,
             COUNT(*) FILTER (WHERE e.event = 'click')::int AS taps
      FROM partner_content_events e
      WHERE ${inWindow(sql.raw("e.timestamp"), current, timeZone)}
        ${partnerCondition(sql.raw("e.partner_id"), partnerId)}
        ${contentCondition(filter.contentId)}
      GROUP BY 1, 2
    `
  );

  const surfaces = [...new Set(rows.map((r) => r.surface))].sort();
  const byKey = new Map<string, EventsDay>();
  for (const surface of surfaces) {
    for (const date of eachDay(current)) {
      byKey.set(`${surface}|${date}`, {
        date,
        surface,
        impressions: 0,
        taps: 0,
      });
    }
  }
  for (const row of rows) {
    const day = byKey.get(`${row.surface}|${row.day}`);
    if (day) {
      day.impressions = Number(row.impressions);
      day.taps = Number(row.taps);
    }
  }
  return [...byKey.values()];
}

export type EventsOutlier = {
  partnerId: string;
  contentId: string;
  title: string | null;
  surface: string;
  sessionsSeen: number;
  tapThrough: number;
};

/**
 * Staff only. Items whose tap-through looks too good to be true, with enough
 * sessions behind it that it is not just a small sample.
 */
export async function partnerEventsOutliers(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: { range: Range }
): Promise<EventsOutlier[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;
  const rows = await rowsOf<PairRow & { title: string | null }>(
    db,
    sql`
      SELECT t.*, c.title
      FROM (${pairsQuery(current, timeZone, undefined, undefined)}) t
      LEFT JOIN partner_content c ON c.id = t.content_id
      WHERE t.sessions_seen >= ${OUTLIER_MIN_SESSIONS}
        AND t.sessions_tapped * 100 > ${OUTLIER_TAP_THROUGH}::int * t.sessions_seen
      ORDER BY t.sessions_seen DESC, t.content_id, t.surface
    `
  );
  const outliers: EventsOutlier[] = [];
  for (const r of rows) {
    const { tapThrough, sessionsSeen } = totalsOf(r);
    // The SQL decided on the exact ratio; the number shown is rounded.
    if (tapThrough !== null) {
      outliers.push({
        partnerId: r.partner_id,
        contentId: r.content_id,
        title: r.title,
        surface: r.surface,
        sessionsSeen,
        tapThrough,
      });
    }
  }
  return outliers;
}

export type PartnerEventsRow = {
  partnerId: string;
  companyName: string | null;
} & EventTotals;

/** Staff only. Every partner's totals for the period, most seen first. */
export async function partnerEventsByPartner(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: { range: Range }
): Promise<PartnerEventsRow[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;
  const rows = await rowsOf<{
    partner_id: string;
    company_name: string | null;
    impressions: number;
    taps: number;
    sessions_seen: number;
    sessions_tapped: number;
  }>(
    db,
    sql`
      SELECT t.partner_id, p.company_name,
             SUM(t.impressions)::int AS impressions, SUM(t.taps)::int AS taps,
             SUM(t.sessions_seen)::int AS sessions_seen,
             SUM(t.sessions_tapped)::int AS sessions_tapped
      FROM (${pairsQuery(current, timeZone, undefined, undefined)}) t
      LEFT JOIN partners p ON p.id = t.partner_id
      GROUP BY t.partner_id, p.company_name
      ORDER BY impressions DESC, t.partner_id
      LIMIT 200
    `
  );
  return rows.map((r) => ({
    partnerId: r.partner_id,
    companyName: r.company_name,
    ...totalsOf(r),
  }));
}

export type PartnerIntegration = {
  /** `manual`, `webhook` (legacy `postback` folded in) or `csv`. */
  method: string;
  partners: number;
};

/** Staff only. How many partners send conversion data each way. */
export async function partnerIntegrationSummary(
  db: AnalyticsDb,
  scope: AnalyticsScope
): Promise<PartnerIntegration[]> {
  requireStaff(scope);
  return await rowsOf<PartnerIntegration>(
    db,
    sql`
      SELECT CASE WHEN p.integration_method = 'postback' THEN 'webhook'
                  ELSE p.integration_method END AS method,
             COUNT(*)::int AS partners
      FROM partners p
      GROUP BY 1
      ORDER BY partners DESC, method
    `
  );
}
