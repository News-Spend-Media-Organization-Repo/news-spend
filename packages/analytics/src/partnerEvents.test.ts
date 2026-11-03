import { describe, expect, it } from "bun:test";

import {
  partnerEventsByItem,
  partnerEventsByPartner,
  partnerEventsDaily,
  partnerEventsOutliers,
  partnerEventsSummary,
} from "./partner";
import { AnalyticsAccessError } from "./scope";
import {
  ARTICLE,
  PARTNER,
  PARTNER_A,
  PARTNER_B,
  range,
  STAFF,
  stubDb,
} from "./test-utils";

type Db = ReturnType<typeof stubDb>["db"];

const scoped = [
  [
    "partnerEventsSummary",
    (db: Db, partnerId?: string) =>
      partnerEventsSummary(db, PARTNER, { range: range(), partnerId }),
  ],
  [
    "partnerEventsByItem",
    (db: Db, partnerId?: string) =>
      partnerEventsByItem(db, PARTNER, { range: range(), partnerId }),
  ],
  [
    "partnerEventsDaily",
    (db: Db, partnerId?: string) =>
      partnerEventsDaily(db, PARTNER, { range: range(), partnerId }),
  ],
] as const;

describe("partner events: a partner sees only their own", () => {
  it.each(
    scoped
  )("%s is limited to the partner and the window", async (_name, run) => {
    const { db, queries } = stubDb();

    await run(db);

    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.sql).toMatch(/e\.partner_id = \$\d+::uuid/);
      expect(q.params).toContain(PARTNER_A);
      expect(q.sql).toContain("e.timestamp >=");
      expect(
        q.params.includes(range().current.from) ||
          q.params.includes(range().previous.from)
      ).toBe(true);
    }
  });

  it.each(
    scoped
  )("%s refuses another partner without querying", async (_name, run) => {
    const { db, queries } = stubDb();

    await expect(run(db, PARTNER_B)).rejects.toBeInstanceOf(
      AnalyticsAccessError
    );
    expect(queries).toHaveLength(0);
  });

  it("the summary queries the previous window too", async () => {
    const { db, queries } = stubDb();

    await partnerEventsSummary(db, PARTNER, { range: range() });

    expect(queries.some((q) => q.params.includes(range().previous.from))).toBe(
      true
    );
  });

  it("rejects a content id that is not a UUID", async () => {
    const { db, queries } = stubDb();

    await expect(
      partnerEventsByItem(db, PARTNER, {
        range: range(),
        contentId: "1; DROP TABLE x",
      })
    ).rejects.toBeInstanceOf(RangeError);
    expect(queries).toHaveLength(0);
  });
});

describe("partner events: staff only reports", () => {
  it("outliers reject a partner scope without querying", async () => {
    const { db, queries } = stubDb();

    await expect(
      partnerEventsOutliers(db, PARTNER, { range: range() })
    ).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });

  it("by-partner rejects a partner scope without querying", async () => {
    const { db, queries } = stubDb();

    await expect(
      partnerEventsByPartner(db, PARTNER, { range: range() })
    ).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });
});

const READER_COLUMN = /session_id|device_id|user_id/;
const COUNTED = /COUNT\(DISTINCT [\w.]+\)/g;
const SESSION_JOIN = /\b\w+\.session_id = \w+\.session_id/g;
// Internal CTE select lists: a session id carried between CTEs, never output.
const CTE_LISTS = [
  /SELECT e\.content_id, e\.partner_id, e\.surface, e\.event, e\.session_id\s+FROM partner_content_events e/g,
  /SELECT DISTINCT content_id, partner_id, surface, session_id\s+FROM ev/g,
];
const WILDCARD = /(\w+)\.\*|SELECT \*/g;

describe("partner events: no reader leaves the database", () => {
  async function allQueries() {
    const { db, queries } = stubDb();
    const r = range();

    await partnerEventsSummary(db, STAFF, { range: r });
    await partnerEventsByItem(db, STAFF, { range: r });
    await partnerEventsDaily(db, STAFF, { range: r });
    await partnerEventsOutliers(db, STAFF, { range: r });
    await partnerEventsByPartner(db, STAFF, { range: r });
    return queries;
  }

  it("never selects a reader column, only counts and compares them", async () => {
    const queries = await allQueries();

    expect(queries.length).toBeGreaterThanOrEqual(6);
    for (const q of queries) {
      let rest = q.sql.replace(COUNTED, "").replace(SESSION_JOIN, "");
      for (const list of CTE_LISTS) {
        rest = rest.replace(list, "");
      }
      expect(rest).not.toMatch(READER_COLUMN);
    }
  });

  it("never selects a wildcard of the events table", async () => {
    for (const q of await allQueries()) {
      // Only the derived table `t` (the pair counts) may be selected whole.
      const wildcards = [...q.sql.matchAll(WILDCARD)].map((m) => m[0]);
      expect(wildcards.filter((w) => w !== "t.*")).toEqual([]);
    }
  });
});

describe("partner events: the partner limit is applied where events are read", () => {
  it("binds the partner id once in each query's single event scan", async () => {
    // Every report reads partner_content_events once, in the `ev` CTE (or the
    // daily query), and everything else derives from it. Removing the
    // condition there leaves the partner id bound zero times.
    for (const [, run] of scoped) {
      const { db, queries } = stubDb();
      await run(db);
      for (const q of queries) {
        const scans = q.sql.match(/FROM partner_content_events/g) ?? [];
        const bound = q.params.filter((p) => p === PARTNER_A);
        expect(scans).toHaveLength(1);
        expect(bound).toHaveLength(scans.length);
      }
    }
  });
});

describe("partner events: video depth", () => {
  const pair = (over: Record<string, unknown> = {}) => ({
    content_id: ARTICLE,
    partner_id: PARTNER_A,
    surface: "connect-brand-video",
    impressions: 10,
    taps: 1,
    sessions_seen: 10,
    sessions_tapped: 1,
    starts: 4,
    q25: 4,
    q50: 3,
    q75: 2,
    completes: 1,
    ...over,
  });

  it("counts depth and rates completion against starts", async () => {
    const { db } = stubDb([pair()]);

    const { current } = await partnerEventsSummary(db, STAFF, {
      range: range(),
    });

    expect(current.starts).toBe(4);
    expect(current.completes).toBe(1);
    expect(current.completionRate).toBe(25);
  });

  it("has no completion rate without starts", async () => {
    const { db } = stubDb([
      pair({ starts: 0, completes: 0, q25: 0, q50: 0, q75: 0 }),
    ]);

    const { current } = await partnerEventsSummary(db, STAFF, {
      range: range(),
    });

    expect(current.completionRate).toBeNull();
  });

  it("carries depth into the per-item rows", async () => {
    const { db } = stubDb([{ ...pair(), title: "QA Video Ad" }]);

    const rows = await partnerEventsByItem(db, STAFF, { range: range() });

    expect(rows[0]?.q50).toBe(3);
    expect(rows[0]?.completionRate).toBe(25);
  });
});
