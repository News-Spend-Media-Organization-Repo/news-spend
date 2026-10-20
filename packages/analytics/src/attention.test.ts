import { describe, expect, it } from "bun:test";

import { needsAttention, pushReport } from "./attention";
import { LARGE_GRANT_POINTS } from "./points";
import { AnalyticsAccessError } from "./scope";
import { NOW, PARTNER, range, STAFF, stubDb } from "./test-utils";

describe("attention reports are staff only", () => {
  it("needsAttention refuses a partner before touching the database", async () => {
    const { db, queries } = stubDb();

    await expect(
      needsAttention(db, PARTNER, { now: NOW })
    ).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });

  it("pushReport refuses a partner before touching the database", async () => {
    const { db, queries } = stubDb();

    await expect(
      pushReport(db, PARTNER, { range: range() })
    ).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });
});

describe("needsAttention", () => {
  it("maps each queue and binds the 7-day cutoff", async () => {
    const { db, queries } = stubDb([
      {
        comments_hidden: 3,
        reports_pending: 1,
        identity_in_review: 2,
        flags_unreviewed: 0,
        push_failed: 5,
        witness_week: 4,
        large_grants: 2,
      },
    ]);

    const counts = await needsAttention(db, STAFF, { now: NOW });

    expect(counts).toEqual({
      commentsHidden: 3,
      reportsPending: 1,
      identityInReview: 2,
      flagsUnreviewed: 0,
      pushFailed: 5,
      witnessWeek: 4,
      largeGrants: 2,
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.params).toContain("2026-09-13T10:00:00.000Z");
    expect(queries[0]?.params).toContain(LARGE_GRANT_POINTS);
    expect(queries[0]?.sql).toContain("moderation_status = 'hidden'");
    // Only suspicious flags nobody has reviewed: not cleared ones, and not
    // ones already disqualified.
    expect(queries[0]?.sql).toContain("trust_status = 'suspicious'");
    expect(queries[0]?.sql).toContain("reviewed_by_id IS NULL");
  });

  it("defaults large grants to zero when the column is absent", async () => {
    const { db } = stubDb([{ comments_hidden: 0 }]);

    const counts = await needsAttention(db, STAFF, { now: NOW });

    expect(counts.largeGrants).toBe(0);
  });
});

describe("pushReport", () => {
  const rows = [
    {
      id: "n1",
      title: "Morning brief",
      sent_at: "2026-09-19T07:00:00.000Z",
      delivered: 800,
      opened: 200,
      failed: 50,
      total: 1050,
    },
    {
      id: "n2",
      title: "Breaking",
      sent_at: "2026-09-18T07:00:00.000Z",
      delivered: 0,
      opened: 0,
      failed: 0,
      total: 0,
    },
  ];

  const totalsRow = {
    campaigns: 12,
    delivered: 9000,
    opened: 1800,
    failed: 200,
    total: 11_000,
  };
  const answer = (q: { sql: string }) =>
    q.sql.includes("COUNT(DISTINCT n.id)") ? [totalsRow] : rows;

  it("rates each campaign", async () => {
    const { db } = stubDb(answer);

    const report = await pushReport(db, STAFF, { range: range() });

    expect(report.campaigns).toHaveLength(2);
    expect(report.campaigns[0]).toMatchObject({
      title: "Morning brief",
      openedRate: 19,
    });
    // No deliveries is empty rates, not zero rates.
    expect(report.campaigns[1]?.openedRate).toBeNull();
  });

  it("totals every campaign in the period, not just the ones listed", async () => {
    const { db, queries } = stubDb(answer);

    const { totals, campaigns } = await pushReport(db, STAFF, {
      range: range(),
      limit: 2,
    });

    expect(campaigns).toHaveLength(2);
    expect(totals).toEqual({
      campaigns: 12,
      delivered: 9000,
      opened: 1800,
      failed: 200,
      openedRate: 16.4,
      failedRate: 1.8,
    });
    // The list is limited; the totals query is not.
    const totalsQuery = queries.find((q) =>
      q.sql.includes("COUNT(DISTINCT n.id)")
    );
    expect(totalsQuery?.sql).not.toContain("LIMIT");
    expect(queries.some((q) => q.sql.includes("LIMIT"))).toBe(true);
  });

  it("has empty totals when nothing was sent", async () => {
    const { db } = stubDb([]);

    const { totals } = await pushReport(db, STAFF, { range: range() });

    expect(totals).toEqual({
      campaigns: 0,
      delivered: 0,
      opened: 0,
      failed: 0,
      openedRate: null,
      failedRate: null,
    });
  });

  it("clamps the limit", async () => {
    const { db, queries } = stubDb([]);

    await pushReport(db, STAFF, { range: range(), limit: 500 });

    expect(queries.some((q) => q.params.includes(50))).toBe(true);
  });
});
