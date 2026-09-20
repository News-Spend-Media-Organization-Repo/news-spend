import { describe, expect, it } from "bun:test";

import { giveawayReport } from "./giveaway";
import { AnalyticsAccessError } from "./scope";
import { PARTNER, range, STAFF, stubDb } from "./test-utils";

const GIVEAWAY = "22222222-2222-4222-8222-222222222222";
const filter = { range: range() };

describe("giveawayReport is staff only", () => {
  it("refuses a partner before touching the database", async () => {
    const { db, queries } = stubDb();

    await expect(
      giveawayReport(db, PARTNER, GIVEAWAY, filter)
    ).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });
});

describe("giveawayReport", () => {
  it("rejects a malformed giveaway id without querying", async () => {
    const { db, queries } = stubDb();

    await expect(
      giveawayReport(db, STAFF, "not-a-uuid", filter)
    ).rejects.toBeInstanceOf(RangeError);
    expect(queries).toHaveLength(0);
  });

  it("assembles every section and binds the giveaway id", async () => {
    const { db, queries } = stubDb((query) => {
      if (query.sql.includes("FROM giveaways")) {
        return [
          {
            id: GIVEAWAY,
            name: "Weekly draw",
            status: "active",
            start_date: "2026-09-14T08:00:00.000Z",
            end_date: "2026-09-28T08:00:00.000Z",
            total_valid_participants: 40,
            draw_completed_at: null,
          },
        ];
      }
      if (query.sql.includes("FROM giveaway_tickets")) {
        if (query.sql.includes("GROUP BY")) {
          return [{ day: "2026-09-14", issued: "10", entrants: 4 }];
        }
        return [{ issued: "25", entrants: 9 }];
      }
      if (query.sql.includes("FROM giveaway_engagements")) {
        return [{ day: "2026-09-14", source: "partner", type: "boost", n: 6 }];
      }
      if (query.sql.includes("FROM giveaway_pool_snapshots")) {
        return [{ tier: "tier1", candidates: "30", locked_at: null }];
      }
      if (query.sql.includes("FROM giveaway_prizes")) {
        return [{ tier: "tier1", max_units: "5", awarded: "2" }];
      }
      if (query.sql.includes("prize_name")) {
        return [
          {
            tier: "tier1",
            prize: "Airtime",
            claim_status: "unclaimed",
            fulfilment_status: "pending",
            selected_at: "2026-09-20T08:00:00.000Z",
          },
        ];
      }
      if (query.sql.includes("w.fulfilment_status::text AS status")) {
        return [{ status: "pending", n: 1 }];
      }
      if (query.sql.includes("claim_status::text")) {
        return [{ status: "unclaimed", n: 1 }];
      }
      if (query.sql.includes("w.tier::text")) {
        return [{ tier: "tier1", winners: 1 }];
      }
      if (query.sql.includes("giveaway_fulfilment_attempts")) {
        if (query.sql.includes("COUNT(DISTINCT")) {
          return [{ disqualified: 0, failing: 0 }];
        }
        return [
          {
            sent: 1,
            already_sent: 0,
            retryable: 0,
            permanent: 0,
            skipped: 0,
          },
        ];
      }
      return [{ n: 1 }];
    });

    const report = await giveawayReport(db, STAFF, GIVEAWAY, {
      ...filter,
      now: new Date("2026-09-20T10:00:00Z"),
    });

    expect(report.state).toMatchObject({
      name: "Weekly draw",
      status: "active",
      live: true,
      totalValidParticipants: 40,
    });
    expect(report.tickets).toEqual({ issued: 25, entrants: 9 });
    expect(report.ticketDaily.find((d) => d.date === "2026-09-14")).toEqual({
      date: "2026-09-14",
      issued: 10,
      entrants: 4,
    });
    expect(report.engagements.totals).toMatchObject({
      partner: 6,
      google: 0,
      boost: 6,
    });
    expect(report.pool).toEqual([
      { tier: "tier1", candidates: 30, lockedAt: null },
    ]);
    expect(report.prizes).toEqual([
      { tier: "tier1", maxUnits: 5, awarded: 2, remaining: 3 },
    ]);
    expect(report.winners.total).toBe(1);
    expect(report.recentWinners[0]).toMatchObject({
      tier: "tier1",
      prize: "Airtime",
    });
    expect(report.fulfilment.sent).toBe(1);
    expect(report.attention).toEqual({
      onHold: 0,
      awaitingVerification: 0,
      disqualified: 0,
      fulfilmentFailing: 0,
    });

    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.params).toContain(GIVEAWAY);
    }
  });

  it("reports a missing giveaway as no state, not a crash", async () => {
    const { db } = stubDb([]);

    const report = await giveawayReport(db, STAFF, GIVEAWAY, filter);

    expect(report.state).toBeNull();
    expect(report.tickets).toEqual({ issued: 0, entrants: 0 });
  });
});
