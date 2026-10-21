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

describe("partner events: no reader leaves the database", () => {
  it("never selects a reader column, only counts and compares them", async () => {
    const { db, queries } = stubDb();
    const r = range();

    await partnerEventsSummary(db, STAFF, { range: r });
    await partnerEventsByItem(db, STAFF, { range: r });
    await partnerEventsDaily(db, STAFF, { range: r });
    await partnerEventsOutliers(db, STAFF, { range: r });
    await partnerEventsByPartner(db, STAFF, { range: r });

    expect(queries.length).toBeGreaterThanOrEqual(6);
    for (const q of queries) {
      // The only places a reader column may appear: COUNT(DISTINCT ...) and the
      // session equality that joins a tap to its impression.
      const rest = q.sql
        .replace(/COUNT\(DISTINCT [\w.]+\)/g, "")
        .replace(/\bi\.session_id = e\.session_id/g, "");
      expect(rest).not.toMatch(/session_id|device_id|user_id/);
    }
  });
});
