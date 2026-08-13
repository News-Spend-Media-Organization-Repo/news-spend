import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import { createFakePayload, expectError, mockContext } from "../../test-utils";
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
    expect(payload.docs("news-analytics")).toHaveLength(1);
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
    expect(payload.docs("news-analytics")).toHaveLength(3);
  });

  it("defaults timestamp when not provided", async () => {
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
    const ctx = mockContext({ payload });

    await call(
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

    const doc = payload.docs("news-analytics")[0];
    expect(doc?.timestamp).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// articleStats
// ---------------------------------------------------------------------------
describe("newsAnalyticsRouter.articleStats", () => {
  it("computes totals and CTR", async () => {
    const payload = createFakePayload({
      collections: {
        "news-analytics": [
          {
            id: "a1",
            article: "news-1",
            event: "impression",
            timestamp: new Date().toISOString(),
          },
          {
            id: "a2",
            article: "news-1",
            event: "impression",
            timestamp: new Date().toISOString(),
          },
          {
            id: "a3",
            article: "news-1",
            event: "view",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
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
    const payload = createFakePayload({
      collections: {
        "news-analytics": [],
      },
    });
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

  it("fills missing days with counts fallback", async () => {
    const payload = createFakePayload({
      collections: {
        "news-analytics": [
          {
            id: "a1",
            article: "news-1",
            event: "view",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.articleStats,
      { articleId: "news-1", days: 7 },
      { context: ctx }
    );

    expect(result.trend.length).toBe(7);
    for (const entry of result.trend) {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("views");
      expect(entry).toHaveProperty("impressions");
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
        "news-analytics": [
          {
            id: "a1",
            article: "news-1",
            event: "view",
            timestamp: new Date().toISOString(),
          },
          {
            id: "a2",
            article: "news-1",
            event: "view",
            timestamp: new Date().toISOString(),
          },
          {
            id: "a3",
            article: "news-2",
            event: "view",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
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

  it("respects the limit parameter", async () => {
    const payload = createFakePayload({
      collections: {
        "news-analytics": [
          {
            id: "a1",
            article: "news-1",
            event: "view",
            timestamp: new Date().toISOString(),
          },
          {
            id: "a2",
            article: "news-2",
            event: "view",
            timestamp: new Date().toISOString(),
          },
          {
            id: "a3",
            article: "news-3",
            event: "view",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.topArticles,
      { event: "view", days: 30, limit: 2 },
      { context: ctx }
    );

    expect(result).toHaveLength(2);
  });

  it("handles populated article objects", async () => {
    const payload = createFakePayload({
      collections: {
        "news-analytics": [
          {
            id: "a1",
            article: { id: "news-1", title: "Article 1" },
            event: "view",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      newsAnalyticsRouter.topArticles,
      { event: "view" },
      { context: ctx }
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.articleId).toBe("news-1");
    expect(result[0]?.article).toEqual({ id: "news-1", title: "Article 1" });
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
