import { describe, expect, it } from "bun:test";

import {
  partnerDaily,
  partnerRecentConversions,
  partnerSummary,
} from "./partner";
import { AnalyticsAccessError } from "./scope";
import {
  PARTNER,
  PARTNER_A,
  PARTNER_B,
  range,
  STAFF,
  stubDb,
} from "./test-utils";

const LIMITED_TO_A_PARTNER = /(partner_id|store_id) = \$\d+::uuid/;
const ANY_PARTNER_LIMIT = /(partner_id|store_id) = /;
const NAMES_A_READER = /user_id|users/;

const reports = [
  [
    "partnerSummary",
    (db: ReturnType<typeof stubDb>["db"], partnerId?: string) =>
      partnerSummary(db, PARTNER, { range: range(), partnerId }),
  ],
  [
    "partnerDaily",
    (db: ReturnType<typeof stubDb>["db"], partnerId?: string) =>
      partnerDaily(db, PARTNER, { range: range(), partnerId }),
  ],
  [
    "partnerRecentConversions",
    (db: ReturnType<typeof stubDb>["db"], partnerId?: string) =>
      partnerRecentConversions(db, PARTNER, { partnerId }),
  ],
] as const;

describe("a partner sees only their own", () => {
  it.each(
    reports
  )("%s is limited to the partner's id, asked or not", async (_name, run) => {
    const { db, queries } = stubDb();

    await run(db);

    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.params).toContain(PARTNER_A);
      expect(q.sql).toMatch(LIMITED_TO_A_PARTNER);
    }
  });

  it.each(
    reports
  )("%s refuses a request for another partner, without querying", async (_name, run) => {
    const { db, queries } = stubDb();

    await expect(run(db, PARTNER_B)).rejects.toBeInstanceOf(
      AnalyticsAccessError
    );
    expect(queries).toHaveLength(0);
  });

  it("never sends another partner's id, even when it is named as their own", async () => {
    const { db, queries } = stubDb();

    await partnerSummary(db, PARTNER, { range: range(), partnerId: PARTNER_A });

    for (const q of queries) {
      expect(q.params).not.toContain(PARTNER_B);
    }
  });
});

describe("staff choose", () => {
  it("see one partner when they name one", async () => {
    const { db, queries } = stubDb();

    await partnerSummary(db, STAFF, { range: range(), partnerId: PARTNER_B });

    for (const q of queries) {
      expect(q.params).toContain(PARTNER_B);
    }
  });

  it("see every partner when they name none", async () => {
    const { db, queries } = stubDb();

    await partnerSummary(db, STAFF, { range: range() });

    for (const q of queries) {
      expect(q.sql).not.toMatch(ANY_PARTNER_LIMIT);
    }
  });

  it("are refused a malformed partner id before it reaches the database", async () => {
    const { db, queries } = stubDb();

    await expect(
      partnerSummary(db, STAFF, { range: range(), partnerId: "x' OR '1'='1" })
    ).rejects.toThrow(RangeError);
    expect(queries).toHaveLength(0);
  });
});

describe("partnerSummary", () => {
  it("derives conversions, the rate and points from where the clicks ended up", async () => {
    const { db } = stubDb((q) =>
      q.sql.includes("partner_conversions")
        ? [
            {
              clicks: 100,
              waiting: 60,
              pending: 10,
              awarded: 25,
              failed: 5,
              points: 6250,
            },
          ]
        : [{ views: 900, clicks: 80 }]
    );

    const { conversions, shop } = await partnerSummary(db, STAFF, {
      range: range(),
    });

    expect(conversions.current).toEqual({
      clicks: 100,
      waiting: 60,
      pending: 10,
      awarded: 25,
      failed: 5,
      conversions: 35,
      pointsAwarded: 6250,
      conversionRate: 35,
    });
    expect(shop.current).toEqual({ views: 900, clicks: 80 });
  });

  it("is zeros, with no rate, when there is no activity", async () => {
    const { db } = stubDb([]);

    const { conversions } = await partnerSummary(db, STAFF, { range: range() });

    expect(conversions.current.clicks).toBe(0);
    expect(conversions.current.conversionRate).toBeNull();
  });
});

describe("partnerDaily", () => {
  it("fills every day and keeps clicks and conversions apart", async () => {
    const r = range(7);
    const { db } = stubDb([
      { day: r.current.from, kind: "click", n: 5 },
      { day: r.current.from, kind: "conversion", n: 2 },
      { day: r.current.to, kind: "click", n: 1 },
    ]);

    const days = await partnerDaily(db, STAFF, { range: r });

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({
      date: r.current.from,
      clicks: 5,
      conversions: 2,
    });
    expect(days[6]).toEqual({ date: r.current.to, clicks: 1, conversions: 0 });
  });
});

describe("partnerRecentConversions", () => {
  it("does not identify a reader, in the query or in the result", async () => {
    const { db, queries } = stubDb([
      {
        click_id: "clk_1",
        status: "awarded",
        points_awarded: 250,
        partner_order_id: "ORD-9",
        partner_name: "Shopwise",
        content: "Weekend offer",
        clicked_at: new Date("2026-09-19T10:00:00Z"),
        converted_at: new Date("2026-09-19T10:05:00Z"),
        awarded_at: null,
        user_id: "should-never-be-selected",
      },
    ]);

    const [row] = await partnerRecentConversions(db, PARTNER, {});

    expect(queries[0]?.sql).not.toMatch(NAMES_A_READER);
    expect(Object.keys(row ?? {}).sort()).toEqual(
      [
        "awardedAt",
        "clickId",
        "clickedAt",
        "content",
        "convertedAt",
        "partnerName",
        "partnerOrderId",
        "pointsAwarded",
        "status",
      ].sort()
    );
    expect(row).toMatchObject({
      clickId: "clk_1",
      pointsAwarded: 250,
      awardedAt: null,
    });
  });

  it("clamps the limit", async () => {
    const { db, queries } = stubDb();

    await partnerRecentConversions(db, STAFF, { limit: 100_000 });

    expect(queries[0]?.params).toContain(50);
  });
});
