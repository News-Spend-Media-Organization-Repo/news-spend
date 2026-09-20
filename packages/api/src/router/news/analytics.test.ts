import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import {
  createFakePayload,
  expectError,
  mockContext,
  stubDrizzle,
} from "../../test-utils";
import { newsAnalyticsRouter } from "./analytics";

const authedUser = { id: "user-1", isAnonymous: false, username: "tester" };

// ---------------------------------------------------------------------------
// track
// ---------------------------------------------------------------------------
describe("newsAnalyticsRouter.track", () => {
  it("creates analytics events for valid articles", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          {
            id: "news-1",
            type: "article",
            _status: "published",
            slug: "a1",
          },
        ],
      },
    });
    const drizzle = stubDrizzle(payload, [{ id: "evt-1" }]);
    const ctx = mockContext({ payload });

    const result = await call(
      newsAnalyticsRouter.track,
      {
        events: [
          {
            articleId: "news-1",
            event: "view",
            sessionId: "sess-1",
            deviceId: "device-1",
          },
        ],
      },
      { context: ctx }
    );

    expect(result.inserted).toBe(1);
    expect(result.failed).toBe(0);
    // One statement for the whole batch, not one per event.
    expect(drizzle.queries).toHaveLength(1);
    expect(drizzle.queries[0]?.sql).toContain("news_analytics");
  });

  it("drops events with unknown article IDs", async () => {
    const payload = createFakePayload({
      collections: {
        news: [],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      newsAnalyticsRouter.track,
      {
        events: [
          {
            articleId: "unknown-id",
            event: "view",
            sessionId: "sess-1",
            deviceId: "device-1",
          },
        ],
      },
      { context: ctx }
    );

    expect(result.inserted).toBe(0);
    expect(result.failed).toBe(0);
    // Dropped is reported separately from a write failure.
    expect(result.dropped).toBe(1);
  });

  it("returns correct shape with multiple events", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          {
            id: "news-1",
            type: "article",
            _status: "published",
            slug: "a1",
          },
          {
            id: "news-2",
            type: "article",
            _status: "published",
            slug: "a2",
          },
        ],
      },
    });
    const drizzle = stubDrizzle(payload, [
      { id: "evt-1" },
      { id: "evt-2" },
      { id: "evt-3" },
    ]);
    const ctx = mockContext({ payload });

    const result = await call(
      newsAnalyticsRouter.track,
      {
        events: [
          {
            articleId: "news-1",
            event: "impression",
            sessionId: "sess-1",
            deviceId: "device-1",
          },
          {
            articleId: "news-2",
            event: "view",
            sessionId: "sess-1",
            deviceId: "device-1",
          },
          {
            articleId: "news-1",
            event: "read",
            sessionId: "sess-1",
            deviceId: "device-1",
          },
        ],
      },
      { context: ctx }
    );

    expect(result.inserted).toBe(3);
    expect(result.failed).toBe(0);
    // Three events, still a single round trip.
    expect(drizzle.queries).toHaveLength(1);
  });

  it("still writes a batch when no timestamp is supplied", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          {
            id: "news-1",
            type: "article",
            _status: "published",
            slug: "a1",
          },
        ],
      },
    });
    const drizzle = stubDrizzle(payload, [{ id: "evt-1" }]);
    const ctx = mockContext({ payload });

    const result = await call(
      newsAnalyticsRouter.track,
      {
        events: [
          {
            articleId: "news-1",
            event: "view",
            sessionId: "sess-1",
            deviceId: "device-1",
          },
        ],
      },
      { context: ctx }
    );

    expect(result.inserted).toBe(1);
    expect(drizzle.queries).toHaveLength(1);
  });

  describe("what the server decides for itself", () => {
    // Each test is its own caller, so the rate limiter's per-caller bucket
    // never carries over from one test to the next.
    let caller = 0;
    const freshCaller = () =>
      new Headers({ "x-forwarded-for": `203.0.113.${++caller}` });

    const article = {
      id: "news-1",
      type: "article",
      _status: "published",
      slug: "a1",
    };
    const view = {
      articleId: "news-1",
      event: "view" as const,
      sessionId: "sess-1",
      deviceId: "device-1",
    };

    const setup = (user?: typeof authedUser) => {
      const payload = createFakePayload({ collections: { news: [article] } });
      const drizzle = stubDrizzle(payload, [{ id: "evt-1" }]);
      const ctx = mockContext({
        payload,
        user: user as never,
        headers: freshCaller(),
      });
      return { drizzle, ctx };
    };

    it("credits events to the signed-in caller", async () => {
      const { drizzle, ctx } = setup(authedUser);

      await call(
        newsAnalyticsRouter.track,
        { events: [view] },
        { context: ctx }
      );

      expect(drizzle.queries[0]?.sql).toContain("user-1");
    });

    it("ignores a userId claimed in the body", async () => {
      const { drizzle, ctx } = setup(authedUser);

      // An older build, or a forged request, naming someone else.
      await call(
        newsAnalyticsRouter.track,
        { events: [view], userId: "victim-9" } as never,
        { context: ctx }
      );

      const sql = drizzle.queries[0]?.sql ?? "";
      expect(sql).toContain("user-1");
      expect(sql).not.toContain("victim-9");
    });

    it("leaves the user empty when nobody is signed in", async () => {
      const { drizzle, ctx } = setup();

      await call(
        newsAnalyticsRouter.track,
        { events: [view], userId: "victim-9" } as never,
        { context: ctx }
      );

      expect(drizzle.queries[0]?.sql).not.toContain("victim-9");
    });

    it("holds a device timestamp in the future to just past arrival", async () => {
      const { drizzle, ctx } = setup(authedUser);

      await call(
        newsAnalyticsRouter.track,
        { events: [{ ...view, timestamp: "2099-01-01T00:00:00.000Z" }] },
        { context: ctx }
      );

      expect(drizzle.queries[0]?.sql).not.toContain("2099");
    });

    it("holds a device timestamp far in the past to the age window", async () => {
      const { drizzle, ctx } = setup(authedUser);

      await call(
        newsAnalyticsRouter.track,
        { events: [{ ...view, timestamp: "2001-01-01T00:00:00.000Z" }] },
        { context: ctx }
      );

      expect(drizzle.queries[0]?.sql).not.toContain("2001");
    });

    it("keeps a plausible device timestamp", async () => {
      const { drizzle, ctx } = setup(authedUser);
      const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      await call(
        newsAnalyticsRouter.track,
        { events: [{ ...view, timestamp: recent }] },
        { context: ctx }
      );

      expect(drizzle.queries[0]?.sql).toContain(recent);
    });

    it("stores each event once per device, by skipping conflicts", async () => {
      const { drizzle, ctx } = setup(authedUser);

      await call(
        newsAnalyticsRouter.track,
        { events: [{ ...view, eventId: "evt-abcdef12" }] },
        { context: ctx }
      );

      const sql = drizzle.queries[0]?.sql ?? "";
      expect(sql).toContain("evt-abcdef12");
      expect(sql).toContain("ON CONFLICT (device_id, event_id) DO NOTHING");
    });

    it("counts a resent batch as duplicates, not failures", async () => {
      // The database recognised all three, so it returned no new rows.
      const payload = createFakePayload({ collections: { news: [article] } });
      stubDrizzle(payload, []);
      const ctx = mockContext({ payload, headers: freshCaller() });

      const result = await call(
        newsAnalyticsRouter.track,
        {
          events: [
            { ...view, eventId: "evt-aaaaaaaa" },
            { ...view, eventId: "evt-bbbbbbbb" },
            { ...view, eventId: "evt-cccccccc" },
          ],
        },
        { context: ctx }
      );

      expect(result).toEqual({
        inserted: 0,
        duplicates: 3,
        failed: 0,
        dropped: 0,
      });
    });

    it("reports a database error as a failure of the whole batch", async () => {
      const payload = createFakePayload({ collections: { news: [article] } });
      Object.assign(payload.db, {
        drizzle: { execute: () => Promise.reject(new Error("db down")) },
      });
      const ctx = mockContext({ payload, headers: freshCaller() });

      const result = await call(
        newsAnalyticsRouter.track,
        { events: [view, view] },
        { context: ctx }
      );

      expect(result).toEqual({
        inserted: 0,
        duplicates: 0,
        failed: 2,
        dropped: 0,
      });
    });

    it("rejects an event id that is too short to be unique", async () => {
      const { ctx } = setup(authedUser);

      const error = await expectError(
        call(
          newsAnalyticsRouter.track,
          { events: [{ ...view, eventId: "abc" }] },
          { context: ctx }
        )
      );

      expect(error.code).toBe("BAD_REQUEST");
    });

    it("rejects oversized identifiers", async () => {
      const { ctx } = setup(authedUser);

      const error = await expectError(
        call(
          newsAnalyticsRouter.track,
          { events: [{ ...view, deviceId: "x".repeat(500) }] },
          { context: ctx }
        )
      );

      expect(error.code).toBe("BAD_REQUEST");
    });
  });

  describe("rate limiting", () => {
    it("stops a caller that sends far more often than the app does", async () => {
      const payload = createFakePayload({ collections: { news: [] } });
      const ctx = mockContext({
        payload,
        headers: new Headers({ "x-forwarded-for": "198.51.100.77" }),
      });
      const send = () =>
        call(
          newsAnalyticsRouter.track,
          {
            events: [
              {
                articleId: "gone",
                event: "view",
                sessionId: "s",
                deviceId: "d",
              },
            ],
          },
          { context: ctx }
        );

      // The allowance is 30 a minute; the app uses about eight.
      for (let i = 0; i < 30; i++) {
        await send();
      }
      const error = await expectError(send());

      expect(error.code).toBe("TOO_MANY_REQUESTS");
    });
  });
});

// ---------------------------------------------------------------------------
// articleStats
// ---------------------------------------------------------------------------
// Both aggregations now GROUP BY in Postgres, so the fixtures are the grouped
// rows the database hands back rather than raw event documents.
describe("newsAnalyticsRouter.articleStats", () => {
  const today = new Date().toISOString().slice(0, 10);

  it("computes totals and CTR", async () => {
    const payload = createFakePayload();
    stubDrizzle(payload, [
      { day: today, event: "impression", count: 2 },
      { day: today, event: "view", count: 1 },
    ]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.articleStats,
      { articleId: "news-1", days: 30 },
      { context: ctx }
    );

    expect(result.totals.impressions).toBe(2);
    expect(result.totals.views).toBe(1);
    expect(result.ctr).toBe(50); // 1/2 * 100 = 50
    expect(result.period).toBe("30 days");
    expect(result.trend.length).toBe(30);
  });

  it("returns 0 CTR when no impressions", async () => {
    const payload = createFakePayload();
    stubDrizzle(payload, []);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.articleStats,
      { articleId: "news-1", days: 7 },
      { context: ctx }
    );

    expect(result.ctr).toBe(0);
    expect(result.totals.impressions).toBe(0);
    expect(result.trend.length).toBe(7);
  });

  it("zeroes days with no events rather than repeating the totals", async () => {
    const payload = createFakePayload();
    stubDrizzle(payload, [{ day: today, event: "view", count: 5 }]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.articleStats,
      { articleId: "news-1", days: 7 },
      { context: ctx }
    );

    expect(result.trend.length).toBe(7);

    // The one day with data carries it; every other day is zero. This used to
    // spread the running totals, so quiet days reported the whole period.
    const withData = result.trend.filter((d) => d.views > 0);
    expect(withData).toHaveLength(1);
    expect(withData[0]?.date).toBe(today);
    expect(withData[0]?.views).toBe(5);

    for (const entry of result.trend) {
      if (entry.date !== today) {
        expect(entry.views).toBe(0);
        expect(entry.impressions).toBe(0);
      }
    }
  });

  it("rejects unauthenticated callers", async () => {
    const payload = createFakePayload();
    const ctx = mockContext({ payload });

    const error = await expectError(
      call(
        newsAnalyticsRouter.articleStats,
        { articleId: "news-1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// topArticles
// ---------------------------------------------------------------------------
describe("newsAnalyticsRouter.topArticles", () => {
  it("returns articles ranked by event count", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          { id: "news-1", title: "Article 1" },
          { id: "news-2", title: "Article 2" },
        ],
      },
    });
    stubDrizzle(payload, [
      { article_id: "news-1", count: 2 },
      { article_id: "news-2", count: 1 },
    ]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.topArticles,
      { event: "view", days: 30, limit: 10 },
      { context: ctx }
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.articleId).toBe("news-1");
    expect(result[0]?.count).toBe(2);
    expect(result[1]?.articleId).toBe("news-2");
    expect(result[1]?.count).toBe(1);
  });

  it("passes the limit through to the ranking query", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          { id: "news-1", title: "Article 1" },
          { id: "news-2", title: "Article 2" },
        ],
      },
    });
    // The database applies LIMIT, so the stub returns what it would have.
    stubDrizzle(payload, [
      { article_id: "news-1", count: 2 },
      { article_id: "news-2", count: 1 },
    ]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.topArticles,
      { event: "view", days: 30, limit: 2 },
      { context: ctx }
    );

    expect(result).toHaveLength(2);
  });

  it("attaches the article document to each ranked row", async () => {
    const payload = createFakePayload({
      collections: {
        news: [{ id: "news-1", title: "Article 1" }],
      },
    });
    stubDrizzle(payload, [{ article_id: "news-1", count: 1 }]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.topArticles,
      { event: "view" },
      { context: ctx }
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.articleId).toBe("news-1");
    expect(result[0]?.article).toMatchObject({
      id: "news-1",
      title: "Article 1",
    });
  });

  it("returns an empty list when nothing matched", async () => {
    const payload = createFakePayload();
    stubDrizzle(payload, []);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.topArticles,
      { event: "view" },
      { context: ctx }
    );

    expect(result).toEqual([]);
  });

  it("rejects unauthenticated callers", async () => {
    const payload = createFakePayload();
    const ctx = mockContext({ payload });

    const error = await expectError(
      call(newsAnalyticsRouter.topArticles, {}, { context: ctx })
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });
});
