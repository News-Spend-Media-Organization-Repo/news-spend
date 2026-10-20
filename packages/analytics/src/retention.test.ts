import { describe, expect, it } from "bun:test";

import { resolveRange } from "./range";
import {
  activationByWeek,
  activeDevicesDaily,
  activeDevicesSummary,
  retentionCohorts,
} from "./retention";
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

describe("device cohort reports are staff only", () => {
  const calls: [
    string,
    (db: ReturnType<typeof stubDb>["db"]) => Promise<unknown>,
  ][] = [
    ["retentionCohorts", (db) => retentionCohorts(db, PARTNER, filter)],
    ["activeDevicesDaily", (db) => activeDevicesDaily(db, PARTNER, filter)],
    ["activeDevicesSummary", (db) => activeDevicesSummary(db, PARTNER, filter)],
  ];

  it.each(
    calls
  )("%s refuses a partner before touching the database", async (_name, run) => {
    const { db, queries } = stubDb();

    await expect(run(db)).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });
});

describe("retentionCohorts", () => {
  const cohort = {
    week: "2026-08-17",
    devices: 20,
    d1_returned: 4,
    d1_eligible: 18,
    w1_returned: 8,
    w1_eligible: 14,
    w2_returned: 2,
    w2_eligible: 0,
    w4_returned: 0,
    w4_eligible: 0,
  };

  it("maps each measure with its returned and eligible counts", async () => {
    const { db } = stubDb([cohort]);

    expect(await retentionCohorts(db, STAFF, filter)).toEqual([
      {
        week: "2026-08-17",
        devices: 20,
        d1: { returned: 4, eligible: 18 },
        w1: { returned: 8, eligible: 14 },
        w2: { returned: 2, eligible: 0 },
        w4: { returned: 0, eligible: 0 },
      },
    ]);
  });

  it("binds the zone, the period and now", async () => {
    const { db, queries } = stubDb();

    await retentionCohorts(db, STAFF, filter);

    const params = queries[0]?.params ?? [];
    expect(params).toContain("Africa/Lagos");
    expect(params).toContain(filter.range.current.from);
    expect(params).toContain(filter.range.current.to);
    expect(
      params.some((p) => p instanceof Date && p.getTime() === NOW.getTime())
    ).toBe(true);
  });

  it("returns nothing and no identifiers on an empty table", async () => {
    const { db, queries } = stubDb();

    expect(await retentionCohorts(db, STAFF, filter)).toEqual([]);
    expect(identifierViolations(queries[0]?.sql ?? "")).toEqual([]);
  });
});

describe("activeDevicesDaily", () => {
  it("zero-fills every day in the period", async () => {
    const { db } = stubDb([{ day: "2026-09-20", devices: 3 }]);

    const week = resolveRange({
      days: 7,
      now: NOW,
      timeZone: "Africa/Lagos",
    });
    const days = await activeDevicesDaily(db, STAFF, {
      ...filter,
      range: week,
    });

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-09-14", devices: 0 });
    expect(days.at(-1)).toEqual({ date: "2026-09-20", devices: 3 });
  });

  it("binds the zone and the period, and selects no identifiers", async () => {
    const { db, queries } = stubDb();

    await activeDevicesDaily(db, STAFF, filter);

    const params = queries[0]?.params ?? [];
    expect(params).toContain("Africa/Lagos");
    expect(params).toContain(filter.range.current.from);
    expect(params).toContain(filter.range.current.to);
    expect(identifierViolations(queries[0]?.sql ?? "")).toEqual([]);
  });

  it("is all zeros for an empty table", async () => {
    const { db } = stubDb();

    const days = await activeDevicesDaily(db, STAFF, filter);

    expect(days).toHaveLength(30);
    expect(days.every((d) => d.devices === 0)).toBe(true);
  });
});

describe("activeDevicesSummary", () => {
  const row = { wau: 40, mau: 120, avg_dau_30: 30 };

  it("measures the current and previous windows and derives stickiness", async () => {
    const { db, queries } = stubDb([row]);

    expect(await activeDevicesSummary(db, STAFF, filter)).toEqual({
      current: { wau: 40, mau: 120, avgDau30: 30, stickiness: 25 },
      previous: { wau: 40, mau: 120, avgDau30: 30, stickiness: 25 },
    });
    expect(queries).toHaveLength(2);
    const params = queries.flatMap((q) => q.params);
    expect(params).toContain("Africa/Lagos");
    expect(params).toContain(filter.range.current.to);
    expect(params).toContain(filter.range.previous.to);
    for (const q of queries) {
      expect(identifierViolations(q.sql)).toEqual([]);
    }
  });

  it("gives zeros and a null stickiness when nothing is active", async () => {
    const { db } = stubDb();

    expect(await activeDevicesSummary(db, STAFF, filter)).toEqual({
      current: { wau: 0, mau: 0, avgDau30: 0, stickiness: null },
      previous: { wau: 0, mau: 0, avgDau30: 0, stickiness: null },
    });
  });
});
