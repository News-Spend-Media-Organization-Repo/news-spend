import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { assertUuid, isoOrNull, rowsOf } from "./db";
import type { Range } from "./range";
import { eachDay, inWindow } from "./range";
import type { AnalyticsScope } from "./scope";
import { requireStaff } from "./scope";

/**
 * One giveaway's stats, for its Stats tab.
 *
 * Everything here is *observed*: rows the server created (purchases it
 * recorded, engagements it completed, pools it locked, draws it ran,
 * fulfilments it attempted). There is no app-reported figure in the
 * giveaway pipeline, so there is nothing tagged Reported.
 *
 * Staff only. Counts and prize names only: no winner, entrant or account is
 * ever named.
 */

export type GiveawayFilter = {
  range: Range;
  now?: Date;
};

export type GiveawayState = {
  id: string;
  name: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  /** True while the countdown is running and entries are open. */
  live: boolean;
  /** Milliseconds until the draw closes, or null once it has. */
  msToDraw: number | null;
  totalValidParticipants: number | null;
  drawCompletedAt: string | null;
};

async function giveawayState(
  db: AnalyticsDb,
  giveawayId: string,
  now: Date
): Promise<GiveawayState | null> {
  const [row] = await rowsOf<{
    id: string;
    name: string | null;
    status: string;
    start_date: unknown;
    end_date: unknown;
    total_valid_participants: number | string | null;
    draw_completed_at: unknown;
  }>(
    db,
    sql`
      SELECT id, name, status::text AS status, start_date, end_date,
             total_valid_participants, draw_completed_at
      FROM giveaways
      WHERE id = ${assertUuid(giveawayId, "giveawayId")}::uuid
    `
  );
  if (!row) {
    return null;
  }

  const end = row.end_date ? new Date(String(row.end_date)) : null;
  const live =
    row.status === "active" && end !== null && end.getTime() > now.getTime();
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    startDate: isoOrNull(row.start_date),
    endDate: isoOrNull(row.end_date),
    live,
    msToDraw: live && end ? end.getTime() - now.getTime() : null,
    totalValidParticipants:
      row.total_valid_participants === null
        ? null
        : Number(row.total_valid_participants),
    drawCompletedAt: isoOrNull(row.draw_completed_at),
  };
}

export type TicketTotals = {
  /** Sum of quantities on valid tickets. */
  issued: number;
  /** Distinct holders of valid tickets. */
  entrants: number;
};

export type TicketDay = { date: string; issued: number; entrants: number };

async function ticketTotals(
  db: AnalyticsDb,
  giveawayId: string
): Promise<TicketTotals> {
  const [row] = await rowsOf<{ issued: number | string; entrants: number }>(
    db,
    sql`
      SELECT COALESCE(SUM(t.quantity), 0)::float8 AS issued,
             COUNT(DISTINCT t.user_id)::int AS entrants
      FROM giveaway_tickets t
      WHERE t.status = 'valid'
        AND t.giveaway_id = ${assertUuid(giveawayId, "giveawayId")}::uuid
    `
  );
  return {
    issued: Number(row?.issued ?? 0),
    entrants: row?.entrants ?? 0,
  };
}

async function ticketDaily(
  db: AnalyticsDb,
  giveawayId: string,
  filter: GiveawayFilter
): Promise<TicketDay[]> {
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<{
    day: string;
    issued: number | string;
    entrants: number;
  }>(
    db,
    sql`
      SELECT to_char((t.purchased_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(t.quantity), 0)::float8 AS issued,
             COUNT(DISTINCT t.user_id)::int AS entrants
      FROM giveaway_tickets t
      WHERE t.status = 'valid'
        AND t.giveaway_id = ${assertUuid(giveawayId, "giveawayId")}::uuid
        AND ${inWindow(sql.raw("t.purchased_at"), current, timeZone)}
      GROUP BY 1
    `
  );

  const byDay = new Map<string, TicketDay>(
    eachDay(current).map((date) => [date, { date, issued: 0, entrants: 0 }])
  );
  for (const row of rows) {
    const day = byDay.get(row.day);
    if (day) {
      day.issued = Number(row.issued);
      day.entrants = row.entrants;
    }
  }
  return [...byDay.values()];
}

export type EngagementSource = "partner" | "google";

export type EngagementDay = {
  date: string;
  partner: number;
  google: number;
};

export type EngagementTotals = {
  partner: number;
  google: number;
  boost: number;
  featuredOffer: number;
};

/**
 * Completed engagements by day and source.
 *
 * Tickets carry no source, so "by source" is engagements, not tickets: a
 * partner item watched in-app, or a Google rewarded ad credited by Google's
 * own verification callback. Only completed engagements count towards tier
 * eligibility, so only completed ones are counted here.
 */
async function engagementDaily(
  db: AnalyticsDb,
  giveawayId: string,
  filter: GiveawayFilter
): Promise<{ days: EngagementDay[]; totals: EngagementTotals }> {
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<{
    day: string;
    source: string;
    type: string;
    n: number;
  }>(
    db,
    sql`
      SELECT to_char((e.completed_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             e.source::text AS source, e.type::text AS type,
             COUNT(*)::int AS n
      FROM giveaway_engagements e
      WHERE e.completion_status = 'completed'
        AND e.giveaway_id = ${assertUuid(giveawayId, "giveawayId")}::uuid
        AND ${inWindow(sql.raw("e.completed_at"), current, timeZone)}
      GROUP BY 1, 2, 3
    `
  );

  const byDay = new Map<string, EngagementDay>(
    eachDay(current).map((date) => [date, { date, partner: 0, google: 0 }])
  );
  const totals: EngagementTotals = {
    partner: 0,
    google: 0,
    boost: 0,
    featuredOffer: 0,
  };
  for (const row of rows) {
    const day = byDay.get(row.day);
    if (row.source === "partner" || row.source === "google") {
      if (day) {
        day[row.source] += row.n;
      }
      totals[row.source] += row.n;
    }
    if (row.type === "boost") {
      totals.boost += row.n;
    } else if (row.type === "featured_offer") {
      totals.featuredOffer += row.n;
    }
  }
  return { days: [...byDay.values()], totals };
}

export type PoolTier = {
  tier: string;
  candidates: number;
  lockedAt: string | null;
};

/**
 * The locked candidate pool, per tier. Empty until the draw locks the pool:
 * there is nothing to show before then, and no history to reconstruct after
 * beyond the snapshot itself.
 */
async function poolComposition(
  db: AnalyticsDb,
  giveawayId: string
): Promise<PoolTier[]> {
  const rows = await rowsOf<{
    tier: string;
    candidates: number | string;
    locked_at: unknown;
  }>(
    db,
    sql`
      SELECT s.tier::text AS tier, s.candidate_count::float8 AS candidates,
             s.locked_at
      FROM giveaway_pool_snapshots s
      WHERE s.giveaway_id = ${assertUuid(giveawayId, "giveawayId")}::uuid
      ORDER BY s.tier
    `
  );
  return rows.map((r) => ({
    tier: r.tier,
    candidates: Number(r.candidates),
    lockedAt: isoOrNull(r.locked_at),
  }));
}

export type PrizeTier = {
  tier: string;
  maxUnits: number;
  awarded: number;
  remaining: number;
};

async function prizeTiers(
  db: AnalyticsDb,
  giveawayId: string
): Promise<PrizeTier[]> {
  const rows = await rowsOf<{
    tier: string;
    max_units: number | string;
    awarded: number | string;
  }>(
    db,
    sql`
      SELECT p.tier::text AS tier,
             COALESCE(SUM(p.max_units), 0)::float8 AS max_units,
             COALESCE(SUM(p.units_awarded), 0)::float8 AS awarded
      FROM giveaway_prizes p
      WHERE p.giveaway_id = ${assertUuid(giveawayId, "giveawayId")}::uuid
      GROUP BY p.tier
      ORDER BY p.tier
    `
  );
  return rows.map((r) => {
    const maxUnits = Number(r.max_units);
    const awarded = Number(r.awarded);
    return {
      tier: r.tier,
      maxUnits,
      awarded,
      remaining: maxUnits - awarded,
    };
  });
}

export type WinnerCounts = {
  total: number;
  byTier: { tier: string; winners: number }[];
  byClaim: { status: string; winners: number }[];
  byFulfilment: { status: string; winners: number }[];
};

export type RecentWinner = {
  tier: string;
  prize: string | null;
  claimStatus: string;
  fulfilmentStatus: string;
  selectedAt: string | null;
};

async function winnerCounts(
  db: AnalyticsDb,
  giveawayId: string
): Promise<{ counts: WinnerCounts; recent: RecentWinner[] }> {
  const id = assertUuid(giveawayId, "giveawayId");
  const [total, byTier, byClaim, byFulfilment, recent] = await Promise.all([
    rowsOf<{ n: number }>(
      db,
      sql`SELECT COUNT(*)::int AS n FROM giveaway_winners w
           WHERE w.giveaway_id = ${id}::uuid`
    ),
    rowsOf<{ tier: string; winners: number }>(
      db,
      sql`SELECT w.tier::text AS tier, COUNT(*)::int AS winners
           FROM giveaway_winners w
           WHERE w.giveaway_id = ${id}::uuid
           GROUP BY 1 ORDER BY 1`
    ),
    rowsOf<{ status: string; winners: number }>(
      db,
      sql`SELECT w.claim_status::text AS status, COUNT(*)::int AS winners
           FROM giveaway_winners w
           WHERE w.giveaway_id = ${id}::uuid
           GROUP BY 1 ORDER BY winners DESC, status`
    ),
    rowsOf<{ status: string; winners: number }>(
      db,
      sql`SELECT w.fulfilment_status::text AS status, COUNT(*)::int AS winners
           FROM giveaway_winners w
           WHERE w.giveaway_id = ${id}::uuid
           GROUP BY 1 ORDER BY winners DESC, status`
    ),
    rowsOf<{
      tier: string;
      prize: string | null;
      claim_status: string;
      fulfilment_status: string;
      selected_at: unknown;
    }>(
      db,
      sql`SELECT w.tier::text AS tier, w.prize_name AS prize,
                 w.claim_status::text AS claim_status,
                 w.fulfilment_status::text AS fulfilment_status,
                 w.selected_at
           FROM giveaway_winners w
           WHERE w.giveaway_id = ${id}::uuid
           ORDER BY w.selected_at DESC, w.id
           LIMIT 10`
    ),
  ]);

  return {
    counts: {
      total: total[0]?.n ?? 0,
      byTier,
      byClaim,
      byFulfilment,
    },
    recent: recent.map((r) => ({
      tier: r.tier,
      prize: r.prize,
      claimStatus: r.claim_status,
      fulfilmentStatus: r.fulfilment_status,
      selectedAt: isoOrNull(r.selected_at),
    })),
  };
}

export type FulfilmentOutcomes = {
  sent: number;
  alreadySent: number;
  retryableFailures: number;
  permanentFailures: number;
  skipped: number;
};

async function fulfilmentOutcomes(
  db: AnalyticsDb,
  giveawayId: string
): Promise<FulfilmentOutcomes> {
  const [row] = await rowsOf<{
    sent: number;
    already_sent: number;
    retryable: number;
    permanent: number;
    skipped: number;
  }>(
    db,
    sql`
      SELECT COUNT(*) FILTER (WHERE a.outcome = 'sent')::int AS sent,
             COUNT(*) FILTER (WHERE a.outcome = 'already_sent')::int AS already_sent,
             COUNT(*) FILTER (WHERE a.outcome = 'retryable_failure')::int AS retryable,
             COUNT(*) FILTER (WHERE a.outcome = 'permanent_failure')::int AS permanent,
             COUNT(*) FILTER (WHERE a.outcome = 'skipped')::int AS skipped
      FROM giveaway_fulfilment_attempts a
      JOIN giveaway_winners w ON w.id = a.winner_id
      WHERE w.giveaway_id = ${assertUuid(giveawayId, "giveawayId")}::uuid
    `
  );
  return {
    sent: row?.sent ?? 0,
    alreadySent: row?.already_sent ?? 0,
    retryableFailures: row?.retryable ?? 0,
    permanentFailures: row?.permanent ?? 0,
    skipped: row?.skipped ?? 0,
  };
}

export type GiveawayAttention = {
  /** Wins held because the account is flagged. */
  onHold: number;
  /** Wins waiting on an identity step. */
  awaitingVerification: number;
  /** Wins taken away after review. */
  disqualified: number;
  /** Winners with at least one retryable fulfilment failure. */
  fulfilmentFailing: number;
};

async function giveawayAttention(
  db: AnalyticsDb,
  giveawayId: string
): Promise<GiveawayAttention> {
  const id = assertUuid(giveawayId, "giveawayId");
  const [statuses, failing] = await Promise.all([
    rowsOf<{ status: string; n: number }>(
      db,
      sql`SELECT w.fulfilment_status::text AS status, COUNT(*)::int AS n
           FROM giveaway_winners w
           WHERE w.giveaway_id = ${id}::uuid
             AND w.fulfilment_status IN ('on_hold', 'awaiting_verification')
           GROUP BY 1`
    ),
    rowsOf<{ disqualified: number; failing: number }>(
      db,
      sql`SELECT COUNT(*) FILTER (WHERE w.claim_status = 'disqualified')::int AS disqualified,
                 COUNT(DISTINCT w.id) FILTER (WHERE a.outcome = 'retryable_failure')::int AS failing
           FROM giveaway_winners w
           LEFT JOIN giveaway_fulfilment_attempts a ON a.winner_id = w.id
           WHERE w.giveaway_id = ${id}::uuid`
    ),
  ]);

  const byStatus = new Map(statuses.map((s) => [s.status, s.n]));
  return {
    onHold: byStatus.get("on_hold") ?? 0,
    awaitingVerification: byStatus.get("awaiting_verification") ?? 0,
    disqualified: failing[0]?.disqualified ?? 0,
    fulfilmentFailing: failing[0]?.failing ?? 0,
  };
}

export type GiveawayReport = {
  state: GiveawayState | null;
  tickets: TicketTotals;
  ticketDaily: TicketDay[];
  engagements: { days: EngagementDay[]; totals: EngagementTotals };
  pool: PoolTier[];
  prizes: PrizeTier[];
  winners: WinnerCounts;
  recentWinners: RecentWinner[];
  fulfilment: FulfilmentOutcomes;
  attention: GiveawayAttention;
};

/** Everything the giveaway's Stats tab shows, in one call. */
export async function giveawayReport(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  giveawayId: string,
  filter: GiveawayFilter
): Promise<GiveawayReport> {
  requireStaff(scope);
  const id = assertUuid(giveawayId, "giveawayId");
  const now = filter.now ?? new Date();

  const [
    state,
    tickets,
    ticketDailyRows,
    engagements,
    pool,
    prizes,
    winners,
    fulfilment,
    attention,
  ] = await Promise.all([
    giveawayState(db, id, now),
    ticketTotals(db, id),
    ticketDaily(db, id, filter),
    engagementDaily(db, id, filter),
    poolComposition(db, id),
    prizeTiers(db, id),
    winnerCounts(db, id),
    fulfilmentOutcomes(db, id),
    giveawayAttention(db, id),
  ]);

  return {
    state,
    tickets,
    ticketDaily: ticketDailyRows,
    engagements,
    pool,
    prizes,
    winners: winners.counts,
    recentWinners: winners.recent,
    fulfilment,
    attention,
  };
}
