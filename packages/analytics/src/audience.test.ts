import { describe, expect, it } from "bun:test";

import {
  audienceCountries,
  audienceDaily,
  audienceDevices,
  audienceSummary,
  feedbackSummary,
} from "./audience";
import { AnalyticsAccessError } from "./scope";
import { NOW, PARTNER, range, STAFF, stubDb } from "./test-utils";

const filter = { range: range(), now: NOW };

describe("audience reports are staff only", () => {
  const calls: [
    string,
    (db: ReturnType<typeof stubDb>["db"]) => Promise<unknown>,
  ][] = [
    ["audienceSummary", (db) => audienceSummary(db, PARTNER, filter)],
    ["audienceDaily", (db) => audienceDaily(db, PARTNER, filter)],
    ["audienceDevices", (db) => audienceDevices(db, PARTNER, filter)],
    ["audienceCountries", (db) => audienceCountries(db, PARTNER, filter)],
    ["feedbackSummary", (db) => feedbackSummary(db, PARTNER, filter)],
  ];

  it.each(
    calls
  )("%s refuses a partner before touching the database", async (_name, run) => {
    const { db, queries } = stubDb();

    await expect(run(db)).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });
});

describe("audienceSummary", () => {
  it("maps the counts and derives the rates", async () => {
    const { db } = stubDb([
      {
        registered: 1000,
        new_current: 40,
        new_previous: 30,
        active7: 200,
        active30: 500,
        email_verified: 250,
        push_enabled: 600,
        guests: 12,
      },
    ]);

    const summary = await audienceSummary(db, STAFF, filter);

    expect(summary).toMatchObject({
      registered: 1000,
      newUsers: { current: 40, previous: 30 },
      active7: 200,
      active30: 500,
      emailVerified: 250,
      emailVerifiedRate: 25,
      pushEnabled: 600,
      pushRate: 60,
      guests: 12,
    });
  });

  it("leaves the rates empty when there are no registered users", async () => {
    const { db } = stubDb([
      {
        registered: 0,
        new_current: 0,
        new_previous: 0,
        active7: 0,
        active30: 0,
        email_verified: 0,
        push_enabled: 0,
        guests: 0,
      },
    ]);

    const summary = await audienceSummary(db, STAFF, filter);

    expect(summary.emailVerifiedRate).toBeNull();
    expect(summary.pushRate).toBeNull();
  });

  it("runs one statement and binds the activity cutoffs", async () => {
    const { db, queries } = stubDb();
    const r = range(7);

    await audienceSummary(db, STAFF, { range: r, now: NOW });

    expect(queries).toHaveLength(1);
    const params = queries[0]?.params.map(String) ?? [];
    expect(params).toContain("2026-09-13T10:00:00.000Z");
    expect(params).toContain("2026-08-21T10:00:00.000Z");
    const dates = params.filter((p) => /^\d{4}-\d\d-\d\d$/.test(p));
    expect(dates).toEqual(
      expect.arrayContaining([
        r.current.from,
        r.current.to,
        r.previous.from,
        r.previous.to,
      ])
    );
  });

  it("counts guests apart from registered accounts", async () => {
    const { db, queries } = stubDb([
      {
        registered: 5,
        new_current: 1,
        new_previous: 0,
        active7: 2,
        active30: 3,
        email_verified: 1,
        push_enabled: 2,
        guests: 40,
      },
    ]);

    const summary = await audienceSummary(db, STAFF, filter);

    expect(summary.registered).toBe(5);
    expect(summary.guests).toBe(40);
    expect(queries[0]?.sql).toContain("is_anonymous");
  });
});

describe("audienceDaily", () => {
  it("fills days without signups with zeros", async () => {
    const r = range(7);
    const { db } = stubDb([{ day: r.current.from, n: 3 }]);

    const days = await audienceDaily(db, STAFF, { range: r, now: NOW });

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: r.current.from, newUsers: 3 });
    for (const day of days.slice(1)) {
      expect(day.newUsers).toBe(0);
    }
  });
});

describe("audienceDevices", () => {
  it("returns the type and version breakdowns from active tokens", async () => {
    const { db, queries } = stubDb((query) =>
      query.sql.includes("device_type")
        ? [
            { label: "android", tokens: 300 },
            { label: "ios", tokens: 200 },
          ]
        : [{ label: "2.4.6", tokens: 400 }]
    );

    const devices = await audienceDevices(db, STAFF, filter);

    expect(queries).toHaveLength(2);
    expect(devices.byType).toEqual([
      { label: "android", tokens: 300 },
      { label: "ios", tokens: 200 },
    ]);
    expect(devices.byVersion).toEqual([{ label: "2.4.6", tokens: 400 }]);
    for (const q of queries) {
      expect(q.sql).toContain("status = 'active'");
    }
  });
});

describe("audienceCountries", () => {
  it("passes the rows through and clamps the limit", async () => {
    const { db, queries } = stubDb([
      { country: "NG", users: 800 },
      { country: "unknown", users: 12 },
    ]);

    const countries = await audienceCountries(db, STAFF, {
      ...filter,
      limit: 500,
    });

    expect(countries).toEqual([
      { country: "NG", users: 800 },
      { country: "unknown", users: 12 },
    ]);
    expect(queries[0]?.params).toContain(50);
    expect(queries[0]?.sql).toContain("verified_country");
  });
});

describe("feedbackSummary", () => {
  it("averages across types weighted by count", async () => {
    const { db } = stubDb([
      { type: "general", count: 3, average: 4 },
      { type: "bug", count: 1, average: 2 },
    ]);

    const feedback = await feedbackSummary(db, STAFF, filter);

    expect(feedback.total).toBe(4);
    expect(feedback.average).toBe(3.5);
    expect(feedback.byType).toEqual([
      { type: "general", count: 3, average: 4 },
      { type: "bug", count: 1, average: 2 },
    ]);
  });

  it("is empty rather than zero when there is no feedback", async () => {
    const { db } = stubDb([]);

    const feedback = await feedbackSummary(db, STAFF, filter);

    expect(feedback.total).toBe(0);
    expect(feedback.average).toBeNull();
    expect(feedback.byType).toEqual([]);
  });
});
