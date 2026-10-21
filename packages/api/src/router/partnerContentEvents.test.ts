import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import { MAX_EVENT_AGE_MS } from "../lib/eventTime";
import {
  PARTNER_EVENTS_DEVICE_DAILY_CAP,
  PARTNER_EVENTS_MAX_BATCH,
} from "../lib/partnerEventsLimits";
import {
  type CapturedQuery,
  createFakePayload,
  mockContext,
  stubDrizzle,
} from "../test-utils";
import { partnerContentEventsRouter } from "./partnerContentEvents";

const authedUser = { id: "user-1", isAnonymous: false, username: "tester" };

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PARTNER = id(900);
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const item = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  status: "active",
  placements: ["homepage-trending-books", "points-mall-books"],
  partner: PARTNER,
  ...over,
});

const ev = (over: Record<string, unknown> = {}) => ({
  contentId: id(1),
  event: "impression" as const,
  surface: "homepage-trending-books" as const,
  sessionId: "sess-1",
  deviceId: "dev-1",
  ...over,
});

const isCount = (q: CapturedQuery) => q.sql.includes("GROUP BY");
const isInsert = (q: CapturedQuery) => q.sql.includes("INSERT INTO");

/** A fake payload with a stubbed drizzle: the count answers `used`, the insert returns one row per VALUES tuple. */
function setup(
  docs: Record<string, unknown>[],
  {
    used = {},
    throwOnInsert = false,
    returned,
  }: {
    used?: Record<string, number>;
    throwOnInsert?: boolean;
    returned?: number;
  } = {}
) {
  const payload = createFakePayload({
    collections: { "partner-content": docs as never },
  });
  const drizzle = stubDrizzle(payload, (q) => {
    if (isCount(q)) {
      return Object.entries(used).map(([device_id, count]) => ({
        device_id,
        count,
      }));
    }
    // One returned row per VALUES tuple (each carries the partner id once).
    const tuples = q.sql.split(PARTNER).length - 1;
    return Array.from({ length: returned ?? tuples }, (_, i) => ({ id: i }));
  });
  if (throwOnInsert) {
    const original = fakeDb(payload).drizzle.execute;
    fakeDb(payload).drizzle.execute = ((s: never) => {
      if (JSON.stringify(s).includes("INSERT INTO")) {
        return Promise.reject(new Error("boom"));
      }
      return original(s);
    }) as never;
  }
  return { payload, drizzle };
}

// stubDrizzle attaches `drizzle` to the fake's `db`, which is typed without it.
const fakeDb = (payload: ReturnType<typeof createFakePayload>) =>
  payload.db as unknown as {
    drizzle: { execute: (statement: never) => Promise<unknown> };
  };

const track = (
  payload: ReturnType<typeof createFakePayload>,
  events: unknown[],
  ctxOver: Record<string, unknown> = {}
) =>
  call(
    partnerContentEventsRouter.track,
    { events: events as never },
    { context: mockContext({ payload, ...ctxOver }) }
  );

describe("partnerContentEvents.track", () => {
  it("inserts an event for an active item on one of its placements, with the partner from the item and the user from the session", async () => {
    const { payload, drizzle } = setup([item(1)]);

    const result = await track(
      payload,
      [{ ...ev(), userId: "attacker", partner: "evil" }],
      { user: authedUser as never }
    );

    expect(result).toEqual({
      inserted: 1,
      duplicates: 0,
      failed: 0,
      dropped: 0,
    });
    const insert = drizzle.queries.find(isInsert);
    expect(insert?.sql).toContain("partner_content_events");
    expect(insert?.sql).toContain(PARTNER);
    expect(insert?.sql).toContain("user-1");
    expect(insert?.sql).not.toContain("attacker");
    expect(insert?.sql).not.toContain("evil");
  });

  it("stores a guest's event with a null user", async () => {
    const { payload, drizzle } = setup([item(1)]);
    await track(payload, [{ ...ev(), userId: "attacker" }]);
    const insert = drizzle.queries.find(isInsert);
    expect(insert?.sql).not.toContain("user-1");
    expect(insert?.sql).not.toContain("attacker");
  });

  it("accepts a promo-media item with empty placements on the feed surface", async () => {
    const { payload, drizzle } = setup([
      item(1, { type: "promo-media", placements: [] }),
    ]);
    const result = await track(payload, [
      ev({ surface: "homepage-ads-banner" }),
    ]);
    expect(result.inserted).toBe(1);
    expect(drizzle.queries.find(isInsert)).toBeDefined();
  });

  it("accepts a populated partner relationship", async () => {
    const { payload, drizzle } = setup([item(1, { partner: { id: PARTNER } })]);
    const result = await track(payload, [ev()]);
    expect(result.inserted).toBe(1);
    expect(drizzle.queries.find(isInsert)?.sql).toContain(PARTNER);
  });

  describe("drops, never inserts", () => {
    it("an item that does not exist", async () => {
      const { payload, drizzle } = setup([]);
      const result = await track(payload, [ev()]);
      expect(result).toEqual({
        inserted: 0,
        duplicates: 0,
        failed: 0,
        dropped: 1,
      });
      expect(drizzle.queries.find(isInsert)).toBeUndefined();
    });

    it("an item that is not active", async () => {
      for (const status of ["draft", "paused", "archived"]) {
        const { payload, drizzle } = setup([item(1, { status })]);
        const result = await track(payload, [ev()]);
        expect(result.dropped).toBe(1);
        expect(drizzle.queries.find(isInsert)).toBeUndefined();
      }
    });

    it("a surface that is a real placement but not this item's", async () => {
      const { payload, drizzle } = setup([item(1)]);
      const result = await track(payload, [ev({ surface: "lucky-app-wall" })]);
      expect(result.dropped).toBe(1);
      expect(drizzle.queries.find(isInsert)).toBeUndefined();
    });

    it("a content id that is not a uuid, without failing the batch or the lookup", async () => {
      const { payload } = setup([item(1)]);
      const result = await track(payload, [
        ev({ contentId: "not-a-uuid" }),
        ev({ contentId: "1; DROP TABLE x" }),
        ev(),
      ]);
      expect(result).toEqual({
        inserted: 1,
        duplicates: 0,
        failed: 0,
        dropped: 2,
      });
      // The lookup itself must never be handed a malformed id.
      const lookups = payload.calls.filter(
        (c) => c.op === "find" && c.collection === "partner-content"
      );
      expect(lookups).toHaveLength(1);
      const asked = (lookups[0]?.args as { where: { id: { in: string[] } } })
        .where.id.in;
      expect(asked).toEqual([id(1)]);
      expect(asked.every((v) => UUID_SHAPE.test(v))).toBe(true);
    });

    it("a non-promo item with empty placements", async () => {
      const { payload } = setup([item(1, { type: "ad", placements: [] })]);
      expect((await track(payload, [ev()])).dropped).toBe(1);
    });

    it("a promo-media item on any surface but the feed's", async () => {
      const { payload } = setup([
        item(1, { type: "promo-media", placements: [] }),
      ]);
      const result = await track(payload, [
        ev({ surface: "homepage-trending-books" }),
      ]);
      expect(result.dropped).toBe(1);
    });

    it("an item with no partner", async () => {
      const { payload } = setup([item(1, { partner: null })]);
      expect((await track(payload, [ev()])).dropped).toBe(1);
    });

    it("counts only what was dropped, alongside what was kept", async () => {
      const { payload } = setup([item(1), item(2, { status: "draft" })]);
      const result = await track(payload, [
        ev(),
        ev({ contentId: id(2) }),
        ev({ contentId: id(3) }),
      ]);
      expect(result).toEqual({
        inserted: 1,
        duplicates: 0,
        failed: 0,
        dropped: 2,
      });
    });
  });

  it("rejects a surface that is not a placement, at input", async () => {
    const { payload } = setup([item(1)]);
    await expect(
      track(payload, [ev({ surface: "made-up" })])
    ).rejects.toBeDefined();
  });

  it("rejects an empty batch and one over the batch limit", async () => {
    const { payload } = setup([item(1)]);
    await expect(track(payload, [])).rejects.toBeDefined();
    await expect(
      track(
        payload,
        Array.from({ length: PARTNER_EVENTS_MAX_BATCH + 1 }, () => ev())
      )
    ).rejects.toBeDefined();
  });

  it("keeps the first 25 distinct content ids in request order and drops the rest", async () => {
    const docs = Array.from({ length: 30 }, (_, i) => item(i + 1));
    const { payload, drizzle } = setup(docs);
    // 30 distinct ids, plus a repeat of the first (kept) and of the 30th (dropped).
    const events = [
      ...Array.from({ length: 30 }, (_, i) => ev({ contentId: id(i + 1) })),
      ev({ contentId: id(1), sessionId: "sess-2" }),
      ev({ contentId: id(30), sessionId: "sess-2" }),
    ];
    const result = await track(payload, events);
    expect(result.dropped).toBe(6);
    const insert = drizzle.queries.find(isInsert);
    expect(insert?.sql).toContain(id(25));
    expect(insert?.sql).not.toContain(id(26));
    expect(insert?.sql).not.toContain(id(30));
  });

  it("looks the items up once", async () => {
    const { payload } = setup([item(1), item(2)]);
    await track(payload, [
      ev(),
      ev({ contentId: id(2) }),
      ev({ sessionId: "s2" }),
    ]);
    const finds = payload.calls.filter((c) => c.op === "find");
    expect(finds).toHaveLength(1);
  });

  describe("dedupe key", () => {
    it("is imp:<device>:<session>:<content>:<surface> for an impression and null for a click", async () => {
      const { payload, drizzle } = setup([item(1)]);
      await track(payload, [
        ev({ deviceId: "d9", sessionId: "s9" }),
        ev({ event: "click", deviceId: "d9", sessionId: "s9" }),
      ]);
      const insert = drizzle.queries.find(isInsert);
      expect(insert?.sql).toContain(
        `imp:d9:s9:${id(1)}:homepage-trending-books`
      );
      // Exactly one dedupe key among two rows.
      expect(insert?.sql.match(/imp:d9/g)).toHaveLength(1);
    });
  });

  describe("per-device daily cap", () => {
    const tenFor = (device: string) =>
      Array.from({ length: 10 }, (_, i) =>
        ev({ deviceId: device, sessionId: `s${i}` })
      );

    it("accepts what is left under the cap and drops the rest", async () => {
      const { payload, drizzle } = setup([item(1)], {
        used: { "dev-1": PARTNER_EVENTS_DEVICE_DAILY_CAP - 5 },
      });
      const result = await track(payload, tenFor("dev-1"));
      expect(result.dropped).toBe(5);
      const insert = drizzle.queries.find(isInsert);
      expect(insert?.sql.match(/imp:dev-1/g)).toHaveLength(5);
    });

    it("drops everything at the cap and does not insert", async () => {
      const { payload, drizzle } = setup([item(1)], {
        used: { "dev-1": PARTNER_EVENTS_DEVICE_DAILY_CAP },
      });
      const result = await track(payload, tenFor("dev-1"));
      expect(result).toEqual({
        inserted: 0,
        duplicates: 0,
        failed: 0,
        dropped: 10,
      });
      expect(drizzle.queries.find(isInsert)).toBeUndefined();
    });

    it("budgets each device separately", async () => {
      const { payload } = setup([item(1)], {
        used: { "dev-1": PARTNER_EVENTS_DEVICE_DAILY_CAP },
      });
      const result = await track(payload, [
        ev({ deviceId: "dev-1" }),
        ev({ deviceId: "dev-2" }),
      ]);
      expect(result.dropped).toBe(1);
    });

    it("counts with a bound parameter over the past day, in one query", async () => {
      const { payload, drizzle } = setup([item(1)]);
      await track(payload, [
        ev({ deviceId: "dev-1" }),
        ev({ deviceId: "dev-2" }),
      ]);
      const counts = drizzle.queries.filter(isCount);
      expect(counts).toHaveLength(1);
      expect(counts[0]?.sql).toContain(
        "received_at >= now() - interval '1 day'"
      );
      expect(counts[0]?.sql).toContain("partner_content_events");
    });

    it("refuses the batch as failed if the count cannot be read, rather than skipping the cap", async () => {
      const { payload, drizzle } = setup([item(1)]);
      fakeDb(payload).drizzle.execute = (() =>
        Promise.reject(new Error("down"))) as never;
      const result = await track(payload, [ev()]);
      expect(result).toEqual({
        inserted: 0,
        duplicates: 0,
        failed: 1,
        dropped: 0,
      });
      expect(drizzle.queries.find(isInsert)).toBeUndefined();
    });
  });

  it("inserts with ON CONFLICT DO NOTHING and reports duplicates as accepted minus returned", async () => {
    const { payload, drizzle } = setup([item(1)], { returned: 1 });
    const result = await track(payload, [
      ev({ sessionId: "a" }),
      ev({ sessionId: "b" }),
      ev({ sessionId: "c" }),
    ]);
    expect(drizzle.queries.find(isInsert)?.sql).toContain(
      "ON CONFLICT DO NOTHING"
    );
    expect(result).toEqual({
      inserted: 1,
      duplicates: 2,
      failed: 0,
      dropped: 0,
    });
  });

  it("reports the accepted count as failed when the insert throws", async () => {
    const { payload } = setup([item(1)], { throwOnInsert: true });
    const result = await track(payload, [
      ev({ sessionId: "a" }),
      ev({ sessionId: "b" }),
    ]);
    expect(result).toEqual({
      inserted: 0,
      duplicates: 0,
      failed: 2,
      dropped: 0,
    });
  });

  describe("timestamps", () => {
    it("are clamped: an ancient claim is pulled to the window, an unparseable one to arrival", async () => {
      const { payload, drizzle } = setup([item(1)]);
      const before = Date.now();
      await track(payload, [
        ev({ sessionId: "a", timestamp: "2001-01-01T00:00:00Z" }),
        ev({ sessionId: "b", timestamp: "garbage" }),
        ev({ sessionId: "c", timestamp: "2999-01-01T00:00:00Z" }),
      ]);
      const iso = (
        drizzle.queries
          .find(isInsert)
          ?.sql.match(/\d{4}-\d\d-\d\dT[\d:.]+Z/g) ?? []
      ).map((s) => Date.parse(s));
      // Row order is timestamp, received_at for each of three rows.
      const [t1, , t2, , t3] = iso;
      expect(t1).toBeGreaterThanOrEqual(before - MAX_EVENT_AGE_MS - 1000);
      expect(t1).toBeLessThan(before - MAX_EVENT_AGE_MS + 10_000);
      expect(Math.abs((t2 ?? 0) - before)).toBeLessThan(10_000);
      expect(t3).toBeLessThan(before + 10 * 60 * 1000);
    });

    it("keep a plausible device time", async () => {
      const { payload, drizzle } = setup([item(1)]);
      const claimed = new Date(Date.now() - 3_600_000).toISOString();
      await track(payload, [ev({ timestamp: claimed })]);
      expect(drizzle.queries.find(isInsert)?.sql).toContain(claimed);
    });
  });

  it("rate limits a caller after 30 requests a minute", async () => {
    const { payload } = setup([item(1)]);
    let last: unknown;
    for (let i = 0; i < 31; i += 1) {
      try {
        last = await track(payload, [ev({ sessionId: `s${i}` })], {
          headers: new Headers({ "x-forwarded-for": "198.51.100.77" }),
        });
      } catch (error) {
        last = error;
      }
    }
    expect(last).toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
