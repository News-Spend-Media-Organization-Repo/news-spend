import { describe, expect, it } from "bun:test";

import {
  LARGE_GRANT_POINTS,
  pointsBySource,
  pointsConcentration,
  pointsDaily,
  pointsLargeGrants,
  pointsLeaderboard,
  pointsSummary,
} from "./points";
import { AnalyticsAccessError } from "./scope";
import { PARTNER, range, STAFF, stubDb } from "./test-utils";

const ISO_DATE = /^\d{4}-\d\d-\d\d$/;
const NAME_COLUMN = /\bname\b/;
const OUTER_ORDER = /ORDER BY earned DESC, e\.user_id/;
const INNER_ORDER = /ORDER BY e\.earned DESC, e\.user_id/;

const windows = (queries: { params: unknown[] }[]) =>
  queries.map((q) => q.params.filter((p) => ISO_DATE.test(String(p))));

describe("points reports are staff only", () => {
  const filter = { range: range() };
  const calls: [
    string,
    (db: ReturnType<typeof stubDb>["db"]) => Promise<unknown>,
  ][] = [
    ["pointsSummary", (db) => pointsSummary(db, PARTNER, filter)],
    ["pointsDaily", (db) => pointsDaily(db, PARTNER, filter)],
    ["pointsBySource", (db) => pointsBySource(db, PARTNER, filter)],
    ["pointsConcentration", (db) => pointsConcentration(db, PARTNER)],
    ["pointsLeaderboard", (db) => pointsLeaderboard(db, PARTNER, filter)],
    ["pointsLargeGrants", (db) => pointsLargeGrants(db, PARTNER, filter)],
  ];

  it.each(
    calls
  )("%s refuses a partner before touching the database", async (_name, run) => {
    const { db, queries } = stubDb();

    await expect(run(db)).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });
});

describe("pointsSummary", () => {
  const totals = {
    issued: 1000,
    spent: 250,
    reversed: 50,
    active_earners: 7,
    large_grants: 2,
  };
  const outstanding = { outstanding: 12_345 };

  const answer = (query: { sql: string }) =>
    query.sql.includes("AS outstanding") ? [outstanding] : [totals];

  it("maps each window and derives net", async () => {
    const { db } = stubDb(answer);

    const summary = await pointsSummary(db, STAFF, { range: range() });

    expect(summary.current).toEqual({
      issued: 1000,
      spent: 250,
      reversed: 50,
      net: 700,
      activeEarners: 7,
      largeGrants: 2,
    });
    expect(summary.previous).toEqual(summary.current);
    expect(summary.outstanding).toBe(12_345);
  });

  it("runs two windows and one all-time outstanding statement", async () => {
    const { db, queries } = stubDb(answer);
    const r = range(7);

    await pointsSummary(db, STAFF, { range: r });

    expect(queries).toHaveLength(3);
    expect(
      queries.filter((q) => q.sql.includes("AS outstanding"))
    ).toHaveLength(1);
    expect(windows(queries)).toContainEqual([r.current.from, r.current.to]);
    expect(windows(queries)).toContainEqual([r.previous.from, r.previous.to]);
  });

  it("is all zeros for an empty ledger", async () => {
    const { db } = stubDb([]);

    const summary = await pointsSummary(db, STAFF, { range: range() });

    expect(summary.current).toEqual({
      issued: 0,
      spent: 0,
      reversed: 0,
      net: 0,
      activeEarners: 0,
      largeGrants: 0,
    });
    expect(summary.previous).toEqual(summary.current);
    expect(summary.outstanding).toBe(0);
  });

  it("counts only point rows, excludes reversals from spent, and binds the window", async () => {
    const { db, queries } = stubDb(answer);
    const r = range(7);

    await pointsSummary(db, STAFF, { range: r });

    for (const query of queries) {
      expect(query.sql).toContain("type = 'point'");
    }
    const windowed = queries.filter((q) => !q.sql.includes("AS outstanding"));
    for (const query of windowed) {
      expect(query.sql).toContain("a.action <> 'pointReversal'");
    }
    const dates = windows(windowed).flat();
    expect(dates).toEqual(
      expect.arrayContaining([
        r.current.from,
        r.current.to,
        r.previous.from,
        r.previous.to,
      ])
    );
  });

  it("never selects a name, email or username", async () => {
    const { db, queries } = stubDb(answer);

    await pointsSummary(db, STAFF, { range: range() });

    for (const query of queries) {
      expect(query.sql).not.toContain("email");
      expect(query.sql).not.toContain("username");
      expect(query.sql).not.toMatch(NAME_COLUMN);
    }
  });

  it("uses the shared large-grant threshold", () => {
    expect(LARGE_GRANT_POINTS).toBe(5000);
  });
});

describe("pointsDaily", () => {
  it("fills every day of the period in order, zero where nothing happened", async () => {
    const { db } = stubDb([{ day: "2026-09-19", issued: 120, spent: 20 }]);
    const r = range(7);

    const days = await pointsDaily(db, STAFF, { range: r });

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: r.current.from, issued: 0, spent: 0 });
    expect(days.at(-1)?.date).toBe(r.current.to);
    expect(days.find((d) => d.date === "2026-09-19")).toEqual({
      date: "2026-09-19",
      issued: 120,
      spent: 20,
    });
  });

  it("binds the window and excludes reversals from spent", async () => {
    const { db, queries } = stubDb([]);
    const r = range(7);

    await pointsDaily(db, STAFF, { range: r });

    const query = queries[0];
    expect(query?.sql).toContain("to_char");
    expect(query?.sql).toContain("type = 'point'");
    expect(query?.sql).toContain("a.action <> 'pointReversal'");
    expect(query?.params).toContain(r.current.from);
    expect(query?.params).toContain(r.current.to);
    expect(query?.sql).not.toContain("email");
    expect(query?.sql).not.toContain("username");
    expect(query?.sql).not.toMatch(NAME_COLUMN);
  });
});

describe("pointsBySource", () => {
  it("maps issued, spent and users, keeping the database order", async () => {
    const { db } = stubDb([
      { source: "form", issued: 600, spent: 0, users: 2 },
      { source: "read", issued: 40, spent: 0, users: 1 },
      { source: "ticketPurchase", issued: 0, spent: 25, users: 1 },
    ]);

    const sources = await pointsBySource(db, STAFF, { range: range() });

    expect(sources).toEqual([
      { source: "form", issued: 600, spent: 0, users: 2 },
      { source: "read", issued: 40, spent: 0, users: 1 },
      { source: "ticketPurchase", issued: 0, spent: 25, users: 1 },
    ]);
  });

  it("splits surveyTask by provider, guards malformed metadata, and uses a fixed order", async () => {
    const { db, queries } = stubDb([]);

    await pointsBySource(db, STAFF, { range: range() });

    const sql = queries[0]?.sql ?? "";
    expect(sql).toContain("type = 'point'");
    expect(sql).toContain("surveyTask");
    expect(sql).toContain("metadata->>'provider'");
    expect(sql).toContain("jsonb_typeof(a.metadata) = 'object'");
    expect(sql).toContain("'form'");
    expect(sql).toContain("ORDER BY issued DESC, source");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("username");
    expect(sql).not.toMatch(NAME_COLUMN);
  });
});

describe("pointsConcentration", () => {
  it("maps holders, median, p90 and the top-ten share", async () => {
    const { db } = stubDb([
      { holders: 12, median: 6.5, p90: 10.9, top: 75, total: 78 },
    ]);

    const concentration = await pointsConcentration(db, STAFF);

    expect(concentration).toEqual({
      holders: 12,
      median: 6.5,
      p90: 10.9,
      top10Share: 96.2,
    });
  });

  it("is zero holders and null shares for an empty ledger", async () => {
    const { db } = stubDb([]);

    const concentration = await pointsConcentration(db, STAFF);

    expect(concentration).toEqual({
      holders: 0,
      median: null,
      p90: null,
      top10Share: null,
    });
  });

  it("is null, not zero, when the balances sum to nothing", async () => {
    const { db } = stubDb([
      { holders: 2, median: 0, p90: 0, top: 0, total: 0 },
    ]);

    const concentration = await pointsConcentration(db, STAFF);

    expect(concentration.top10Share).toBeNull();
  });

  it("is null, not a negative share, when the balances sum below zero", async () => {
    const { db } = stubDb([
      { holders: 3, median: -10, p90: 0, top: 50, total: -200 },
    ]);

    const concentration = await pointsConcentration(db, STAFF);

    expect(concentration.top10Share).toBeNull();
  });

  it("computes balances from point rows only and selects no name columns", async () => {
    const { db, queries } = stubDb([]);

    await pointsConcentration(db, STAFF);

    const sql = queries[0]?.sql ?? "";
    expect(sql).toContain("type = 'point'");
    expect(sql).toContain("percentile_cont");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("username");
    expect(sql).not.toMatch(NAME_COLUMN);
  });
});

describe("pointsLeaderboard", () => {
  const rows = [
    {
      rank: 1,
      user_id: "u-1",
      earned: 900,
      balance: 1200,
      joined_at: "2026-01-01T08:00:00.000Z",
      top_source: "read",
    },
    {
      rank: 2,
      user_id: "u-2",
      earned: 400,
      balance: 400,
      joined_at: null,
      top_source: null,
    },
  ];

  it("maps rows and leaves an empty ledger empty", async () => {
    expect(
      await pointsLeaderboard(stubDb(rows).db, STAFF, { range: range() })
    ).toEqual([
      {
        rank: 1,
        userId: "u-1",
        earned: 900,
        balance: 1200,
        joinedAt: "2026-01-01T08:00:00.000Z",
        topSource: "read",
      },
      {
        rank: 2,
        userId: "u-2",
        earned: 400,
        balance: 400,
        joinedAt: null,
        topSource: null,
      },
    ]);
    expect(
      await pointsLeaderboard(stubDb([]).db, STAFF, { range: range() })
    ).toEqual([]);
  });

  it("clamps the limit to 1-50, defaulting to 10", async () => {
    for (const [given, expected] of [
      [0, 1],
      [-5, 1],
      [1000, 50],
      [7.9, 7],
      [undefined, 10],
    ] as const) {
      const { db, queries } = stubDb([]);

      await pointsLeaderboard(db, STAFF, { range: range(), limit: given });

      expect(queries[0]?.params).toContain(expected);
    }
  });

  it("orders by earned then user id, with a fixed ORDER BY text", async () => {
    const { db, queries } = stubDb([]);

    await pointsLeaderboard(db, STAFF, { range: range() });

    const sql = queries[0]?.sql ?? "";
    expect(sql).toContain("ROW_NUMBER()");
    expect(sql).toMatch(OUTER_ORDER);
    expect(sql).toMatch(INNER_ORDER);
  });

  it("excludes the sign-up bonus and large grants from earned, never from balance", async () => {
    const { db, queries } = stubDb([]);

    await pointsLeaderboard(db, STAFF, { range: range() });

    const sql = queries[0]?.sql ?? "";
    expect(sql).toContain("a.action <> 'signUp'");
    expect(sql).toContain("a.point <= ");
    expect(sql).toContain("SUM(a.point)");
    expect(sql).toContain("WHERE e.earned > 0");
  });

  it("selects only the columns a leaderboard needs, never a name", async () => {
    const { db, queries } = stubDb([]);

    await pointsLeaderboard(db, STAFF, { range: range() });

    const sql = queries[0]?.sql ?? "";
    expect(sql).toContain("u.created_at");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("username");
    expect(sql).not.toMatch(NAME_COLUMN);
  });
});

describe("pointsLeaderboard leaves out rows with no user", () => {
  it("filters them in both the totals and the top-source query", async () => {
    const { db, queries } = stubDb([]);

    await pointsLeaderboard(db, STAFF, { range: range() });

    const sql = queries[0]?.sql ?? "";
    // One filter per CTE that groups by user (earned and earned_sources).
    expect(sql.match(/user_id IS NOT NULL/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("pointsLargeGrants", () => {
  it("maps grants, newest first, with a null user allowed", async () => {
    const { db } = stubDb([
      {
        id: "g-1",
        user_id: null,
        action: "surveyTask",
        source: "form",
        points: 6000,
        at: "2026-09-19T08:00:00.000Z",
      },
    ]);

    const grants = await pointsLargeGrants(db, STAFF, { range: range() });

    expect(grants).toEqual([
      {
        id: "g-1",
        userId: null,
        action: "surveyTask",
        source: "form",
        points: 6000,
        at: "2026-09-19T08:00:00.000Z",
      },
    ]);
  });

  it("binds the threshold, clamps the limit and orders newest first", async () => {
    for (const [given, expected] of [
      [0, 1],
      [-5, 1],
      [1000, 50],
      [7.9, 7],
      [undefined, 10],
    ] as const) {
      const { db, queries } = stubDb([]);

      await pointsLargeGrants(db, STAFF, { range: range(), limit: given });

      const query = queries[0];
      expect(query?.params).toContain(expected);
      expect(query?.params).toContain(LARGE_GRANT_POINTS);
      expect(query?.sql).toContain("a.point > ");
      expect(query?.sql).toContain("ORDER BY a.created_at DESC, a.id");
      expect(query?.sql).not.toContain("email");
      expect(query?.sql).not.toContain("username");
      expect(query?.sql).not.toMatch(NAME_COLUMN);
    }
  });
});
