import { describe, expect, it } from "bun:test";

import { needsAttention, pushReport } from "./attention";
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
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.params).toContain("2026-09-13T10:00:00.000Z");
    expect(queries[0]?.sql).toContain("moderation_status = 'hidden'");
    expect(queries[0]?.sql).toContain("reviewed_by_id IS NULL");
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

  it("rates each campaign and totals the period", async () => {
    const { db, queries } = stubDb(rows);

    const report = await pushReport(db, STAFF, { range: range() });

    expect(report.campaigns).toHaveLength(2);
    expect(report.campaigns[0]).toMatchObject({
      title: "Morning brief",
      openedRate: 19,
    });
    // No deliveries is empty rates, not zero rates.
    expect(report.campaigns[1]?.openedRate).toBeNull();
    expect(report.totals).toMatchObject({
      campaigns: 2,
      delivered: 800,
      opened: 200,
      failed: 50,
      openedRate: 19,
      failedRate: 4.8,
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toContain("notification_deliveries");
  });

  it("clamps the limit", async () => {
    const { db, queries } = stubDb([]);

    await pushReport(db, STAFF, { range: range(), limit: 500 });

    expect(queries[0]?.params).toContain(50);
  });
});
