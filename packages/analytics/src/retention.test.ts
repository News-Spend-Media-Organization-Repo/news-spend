import { describe, expect, it } from "bun:test";

import { resolveRange } from "./range";
import { activationByWeek } from "./retention";
import { AnalyticsAccessError } from "./scope";
import { NOW, PARTNER, STAFF, stubDb } from "./test-utils";

const filter = {
  range: resolveRange({ days: 30, now: NOW, timeZone: "Africa/Lagos" }),
  now: NOW,
};

/** The report may only output counts and a week label. */
const FORBIDDEN_ALIAS = /\bAS\s+(id|user_id|device_id|email|username)\b/i;

function identifierViolations(sql: string): string[] {
  return [
    FORBIDDEN_ALIAS.test(sql) ? "selected identifier" : "",
    sql.includes("email") ? "email" : "",
    sql.includes("username") ? "username" : "",
  ].filter(Boolean);
}

describe("retention reports are staff only", () => {
  it("refuses a partner before touching the database", async () => {
    const { db, queries } = stubDb();

    await expect(activationByWeek(db, PARTNER, filter)).rejects.toBeInstanceOf(
      AnalyticsAccessError
    );
    expect(queries).toHaveLength(0);
  });
});

describe("activationByWeek", () => {
  it("binds the zone, the period and now", async () => {
    const { db, queries } = stubDb();

    await activationByWeek(db, STAFF, filter);

    expect(queries).toHaveLength(1);
    const [query] = queries;
    expect(query?.params).toContain("Africa/Lagos");
    expect(query?.params).toContain(filter.range.current.from);
    expect(query?.params).toContain(filter.range.current.to);
    expect(
      query?.params.some(
        (p) => p instanceof Date && p.getTime() === NOW.getTime()
      )
    ).toBe(true);
  });

  it("maps each week and derives neverRead from the mature 7-day accounts", async () => {
    const { db } = stubDb([
      {
        week: "2026-09-14",
        signups: 7,
        mature_24h: 5,
        activated_24h: 3,
        mature_7d: 4,
        activated_7d: 2,
      },
    ]);

    expect(await activationByWeek(db, STAFF, filter)).toEqual([
      {
        week: "2026-09-14",
        signups: 7,
        mature24h: 5,
        activated24h: 3,
        mature7d: 4,
        activated7d: 2,
        neverRead: 2,
      },
    ]);
  });

  it("returns nothing for an empty ledger", async () => {
    const { db } = stubDb();

    expect(await activationByWeek(db, STAFF, filter)).toEqual([]);
  });

  it("never outputs a user id, device id or email", async () => {
    const { db, queries } = stubDb();

    await activationByWeek(db, STAFF, filter);

    expect(identifierViolations(queries[0]?.sql ?? "")).toEqual([]);
  });
});
