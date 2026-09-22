import { describe, expect, it } from "bun:test";

import {
  partnerDaily,
  partnerPostbackHealth,
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
  [
    "partnerPostbackHealth",
    (db: ReturnType<typeof stubDb>["db"], partnerId?: string) =>
      partnerPostbackHealth(db, PARTNER, { range: range(), partnerId }),
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

describe("partnerPostbackHealth", () => {
  const rowsFor = (q: { sql: string }) => {
    if (q.sql.includes("MAX(")) {
      return [{ last_received: new Date("2026-09-19T13:00:00Z") }];
    }
    if (q.sql.includes("GROUP BY p.reason")) {
      return [
        { reason: "signature does not match", n: 2 },
        { reason: null, n: 1 },
      ];
    }
    return [
      { total: 7, accepted: 2, failed_reported: 1, duplicate: 1, rejected: 3 },
    ];
  };

  it("counts each outcome, rates the rejections and lists the reasons", async () => {
    const { db } = stubDb(rowsFor);

    const health = await partnerPostbackHealth(db, STAFF, { range: range() });

    expect(health).toEqual({
      total: 7,
      accepted: 2,
      failedReported: 1,
      duplicate: 1,
      rejected: 3,
      rejectedRate: 42.9,
      lastReceivedAt: "2026-09-19T13:00:00.000Z",
      rejectedReasons: [
        { reason: "signature does not match", count: 2 },
        { reason: "no reason recorded", count: 1 },
      ],
    });
  });

  it("is empty, with no rate, when nothing has been received", async () => {
    const { db } = stubDb([]);

    const health = await partnerPostbackHealth(db, STAFF, { range: range() });

    expect(health).toMatchObject({
      total: 0,
      rejected: 0,
      rejectedRate: null,
      lastReceivedAt: null,
      rejectedReasons: [],
    });
  });

  it("finds the last postback regardless of the period, so a quiet month still shows", async () => {
    const { db, queries } = stubDb(rowsFor);

    await partnerPostbackHealth(db, STAFF, { range: range() });

    const last = queries.find((q) => q.sql.includes("MAX("));
    expect(last?.sql).not.toContain("received_at >=");
    const windowed = queries.filter((q) => !q.sql.includes("MAX("));
    for (const q of windowed) {
      expect(q.sql).toContain("received_at");
      expect(q.sql).toContain(">=");
    }
  });

  it("does not identify a reader", async () => {
    const { db, queries } = stubDb(rowsFor);

    await partnerPostbackHealth(db, PARTNER, { range: range() });

    for (const q of queries) {
      expect(q.sql).not.toMatch(NAMES_A_READER);
    }
  });
});
