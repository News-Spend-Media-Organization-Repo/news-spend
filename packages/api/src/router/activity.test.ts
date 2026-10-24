import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import {
  createFakePayload,
  createTestClient,
  type Doc,
  expectError,
  mockContext,
} from "../test-utils";
import { activityRouter } from "./activity";

const authedUser = { id: "user-1", isAnonymous: false, username: "tester" };
const guestUser = { id: "guest-1", isAnonymous: true, username: "guest" };

function activity(overrides: Doc = {}): Doc {
  return {
    id: "a1",
    user: "user-1",
    type: "point",
    action: "read",
    point: 5,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function article(overrides: Doc = {}): Doc {
  return {
    id: "news-1",
    title: "A real headline",
    points: 25,
    ...overrides,
  };
}

function content(overrides: Doc = {}): Doc {
  return {
    id: "content-1",
    title: "A promotion",
    points: 300,
    status: "active",
    ...overrides,
  };
}

function contextWith({
  activities = [],
  news = [article()],
  partnerContent = [content()],
  user = authedUser,
}: {
  activities?: Doc[];
  news?: Doc[];
  partnerContent?: Doc[];
  user?: typeof authedUser | typeof guestUser;
} = {}) {
  const payload = createFakePayload({
    collections: {
      activities,
      users: [{ id: user.id }],
      news,
      "partner-content": partnerContent,
    },
  });
  return { ctx: mockContext({ user: user as never, payload }), payload };
}

const hugeClientPoint = {
  point: 1_000_000,
  type: "bonus",
  reward: "client reward",
  description: "client description",
};

describe("activity.add amounts", () => {
  it("uses the article's points and ignores the client's point, type and description", async () => {
    const { ctx, payload } = contextWith();

    const result = await call(
      activityRouter.add,
      { ...hugeClientPoint, action: "read", newsId: "news-1" },
      { context: ctx }
    );

    const [stored] = payload.docs("activities");
    expect(stored).toMatchObject({
      action: "read",
      point: 25,
      type: "point",
      news: "news-1",
      user: "user-1",
      description: "Read: A real headline",
    });
    expect(stored).not.toMatchObject({
      description: "client description",
      reward: "client reward",
    });
    expect(result).toMatchObject({ point: 25, pointsAwarded: 25 });
  });

  it("uses the app-share amount, not the client's point", async () => {
    const { ctx, payload } = contextWith();

    const result = await call(
      activityRouter.add,
      { ...hugeClientPoint, action: "share" },
      { context: ctx }
    );

    const [stored] = payload.docs("activities");
    expect(stored).toMatchObject({
      action: "share",
      point: 20,
      description: "Shared app",
    });
    expect(result).toMatchObject({ point: 20, pointsAwarded: 20 });
  });

  it("uses an active promotion's points for a promotion share", async () => {
    const { ctx, payload } = contextWith();

    const result = await call(
      activityRouter.add,
      {
        ...hugeClientPoint,
        action: "share",
        partnerContentId: "content-1",
      },
      { context: ctx }
    );

    expect(payload.docs("activities")[0]).toMatchObject({
      action: "share",
      point: 300,
      description: "Shared: A promotion",
    });
    expect(result).toMatchObject({ point: 300, pointsAwarded: 300 });
  });

  it("uses the brand-ad amount, not the client's point", async () => {
    const { ctx, payload } = contextWith();

    const result = await call(
      activityRouter.add,
      { ...hugeClientPoint, action: "connectBrandAd" },
      { context: ctx }
    );

    expect(payload.docs("activities")[0]).toMatchObject({
      action: "connectBrandAd",
      point: 10,
      description: "Connected with a brand",
    });
    expect(result).toMatchObject({ point: 10, pointsAwarded: 10 });
  });

  it("counts a missing article points value as zero", async () => {
    const { ctx, payload } = contextWith({ news: [article({ points: null })] });

    const result = await call(
      activityRouter.add,
      { action: "read", newsId: "news-1" },
      { context: ctx }
    );

    expect(payload.docs("activities")[0]).toMatchObject({ point: 0 });
    expect(result).toMatchObject({ pointsAwarded: 0 });
  });
});

describe("activity.add actions", () => {
  it.each([
    "signUp",
    "lottery",
    "surveyTask",
    "pointReversal",
    "ticketPurchase",
    "watchLive",
    "musicListeningTime",
    "dailyLogin",
    "referral",
  ])("refuses %s and records nothing", async (action) => {
    const { ctx, payload } = contextWith();

    const error = await expectError(
      call(
        activityRouter.add,
        { action, newsId: "news-1", point: 10_000 } as never,
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toBe("action not allowed");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects read without a newsId", async () => {
    const { ctx, payload } = contextWith();

    const error = await expectError(
      call(activityRouter.add, { action: "read" }, { context: ctx })
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects read with an unknown newsId", async () => {
    const { ctx, payload } = contextWith();

    const error = await expectError(
      call(
        activityRouter.add,
        { action: "read", newsId: "missing" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects a share with an unknown partnerContentId", async () => {
    const { ctx, payload } = contextWith();

    const error = await expectError(
      call(
        activityRouter.add,
        { action: "share", partnerContentId: "missing" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects a share of inactive content", async () => {
    const { ctx, payload } = contextWith({
      partnerContent: [content({ status: "paused" })],
    });

    const error = await expectError(
      call(
        activityRouter.add,
        { action: "share", partnerContentId: "content-1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects an article whose points are above the ceiling", async () => {
    const { ctx, payload } = contextWith({
      news: [article({ points: 5001 })],
    });
    const logs: unknown[] = [];
    payload.logger.error = (...args: unknown[]) => logs.push(args);

    const error = await expectError(
      call(
        activityRouter.add,
        { action: "read", newsId: "news-1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(payload.docs("activities")).toHaveLength(0);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("rejects a non-numeric article points value", async () => {
    const { ctx, payload } = contextWith({
      news: [article({ points: "5000" })],
    });

    const error = await expectError(
      call(
        activityRouter.add,
        { action: "read", newsId: "news-1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects a promotion whose points are above the ceiling", async () => {
    const { ctx, payload } = contextWith({
      partnerContent: [content({ points: 5001 })],
    });

    const error = await expectError(
      call(
        activityRouter.add,
        { action: "share", partnerContentId: "content-1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("still refuses a guest", async () => {
    const { ctx } = contextWith({ user: guestUser });

    const error = await expectError(
      call(
        activityRouter.add,
        { action: "read", newsId: "news-1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("FORBIDDEN");
  });
});

describe("activity.add concurrency and caps", () => {
  it("pays a read once when two arrive together", async () => {
    const { ctx, payload } = contextWith();

    const results = await Promise.all([
      call(
        activityRouter.add,
        { action: "read", newsId: "news-1" },
        { context: ctx }
      ),
      call(
        activityRouter.add,
        { action: "read", newsId: "news-1" },
        { context: ctx }
      ),
    ]);

    expect(payload.docs("activities")).toHaveLength(1);
    expect(results.filter((r) => r?.message === "ALREADY_READ")).toHaveLength(
      1
    );
  });

  it("still returns ALREADY_READ on a second read", async () => {
    const { ctx, payload } = contextWith();

    await call(
      activityRouter.add,
      { action: "read", newsId: "news-1" },
      { context: ctx }
    );
    const second = await call(
      activityRouter.add,
      { action: "read", newsId: "news-1" },
      { context: ctx }
    );

    expect(second).toMatchObject({
      message: "ALREADY_READ",
      pointsAwarded: 0,
    });
    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("holds the share cap when two shares arrive together", async () => {
    const today = new Date().toISOString();
    const { ctx, payload } = contextWith({
      activities: Array.from({ length: 4 }, (_, i) =>
        activity({ id: `share-${i}`, action: "share", createdAt: today })
      ),
    });

    const results = await Promise.all([
      call(activityRouter.add, { action: "share" }, { context: ctx }),
      call(activityRouter.add, { action: "share" }, { context: ctx }),
    ]);

    expect(payload.docs("activities")).toHaveLength(5);
    expect(results.filter((r) => r?.message === "CAP_REACHED")).toHaveLength(1);
  });

  it("holds the brand-ad cap when two connectBrandAd calls arrive together", async () => {
    const today = new Date().toISOString();
    const { ctx, payload } = contextWith({
      activities: Array.from({ length: 7 }, (_, i) =>
        activity({
          id: `brand-${i}`,
          action: "connectBrandAd",
          point: 10,
          createdAt: today,
        })
      ),
    });

    const results = await Promise.all([
      call(activityRouter.add, { action: "connectBrandAd" }, { context: ctx }),
      call(activityRouter.add, { action: "connectBrandAd" }, { context: ctx }),
    ]);

    expect(payload.docs("activities")).toHaveLength(8);
    expect(results.filter((r) => r?.message === "CAP_REACHED")).toHaveLength(1);
  });

  it("stops awarding shares once the daily cap is reached", async () => {
    const today = new Date().toISOString();
    const { ctx, payload } = contextWith({
      activities: Array.from({ length: 5 }, (_, i) =>
        activity({ id: `share-${i}`, action: "share", createdAt: today })
      ),
    });

    const result = await call(
      activityRouter.add,
      { action: "share" },
      { context: ctx }
    );

    expect(result).toMatchObject({ message: "CAP_REACHED", pointsAwarded: 0 });
    expect(payload.docs("activities")).toHaveLength(5);
  });
});

describe("activity.byNewsId", () => {
  it("returns only the caller's activities for that article", async () => {
    const { ctx } = contextWith({
      activities: [
        activity({ id: "a1", news: "news-1" }),
        activity({ id: "a2", news: "news-2" }),
        activity({ id: "a3", news: "news-1", user: "user-2" }),
      ],
    });

    const result = await call(
      activityRouter.byNewsId,
      { newsId: "news-1" },
      { context: ctx }
    );

    expect(result.map((doc) => doc.id)).toEqual(["a1"]);
  });

  it("narrows further when an action is given", async () => {
    const { ctx } = contextWith({
      activities: [
        activity({ id: "a1", news: "news-1", action: "read" }),
        activity({ id: "a2", news: "news-1", action: "share" }),
      ],
    });

    const result = await call(
      activityRouter.byNewsId,
      { newsId: "news-1", action: "share" },
      { context: ctx }
    );

    expect(result.map((doc) => doc.id)).toEqual(["a2"]);
  });
});

describe("activity.byUserId", () => {
  // Exercised through a server-side router client rather than `call()`. Same
  // middleware and validation, less ceremony per case.
  it("returns an empty page for a category the endpoint does not serve", async () => {
    const { ctx } = contextWith({ activities: [activity()] });
    const client = createTestClient(activityRouter, ctx);

    const result = await client.byUserId({
      category: "referrals",
      type: "posted",
    });

    expect(result).toMatchObject({ docs: [], totalDocs: 0 });
  });

  it("paginates the caller's activities newest first", async () => {
    const { ctx } = contextWith({
      activities: [
        activity({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" }),
        activity({ id: "new", createdAt: "2026-01-03T00:00:00.000Z" }),
        activity({ id: "mid", createdAt: "2026-01-02T00:00:00.000Z" }),
        activity({ id: "other-user", user: "user-2" }),
      ],
    });
    const client = createTestClient(activityRouter, ctx);

    const result = await client.byUserId({
      category: "all",
      type: "posted",
      startDate: "2025-12-31",
      endDate: "2026-01-04",
      limit: 2,
      page: 1,
    });

    expect(result.docs.map((doc) => doc.id)).toEqual(["new", "mid"]);
    expect(result).toMatchObject({
      totalDocs: 3,
      totalPages: 2,
      hasNextPage: true,
      nextPage: 2,
    });
  });
});

describe("activity.pendingOffers", () => {
  const hoursAgo = (h: number) =>
    new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

  function conversion(overrides: Doc = {}): Doc {
    return {
      id: "cv1",
      user: "user-1",
      partner: "partner-1",
      content: "content-1",
      surface: "points-mall-apps",
      status: "clicked",
      clickedAt: hoursAgo(1),
      ...overrides,
    };
  }

  function pendingContext({
    conversions,
    user = authedUser,
    partners = [{ id: "partner-1", companyName: "Acme", confirmationDays: 3 }],
    partnerContent = [content()],
  }: {
    conversions: Doc[];
    user?: typeof authedUser | typeof guestUser;
    partners?: Doc[];
    partnerContent?: Doc[];
  }) {
    const payload = createFakePayload({
      collections: {
        users: [{ id: user.id }],
        partners,
        "partner-content": partnerContent,
        "partner-conversions": conversions,
      },
    });
    return mockContext({ user: user as never, payload });
  }

  it("returns one entry per offer, from the latest click", async () => {
    const newest = hoursAgo(2);
    const ctx = pendingContext({
      conversions: [
        conversion({ id: "old", clickedAt: hoursAgo(10) }),
        conversion({ id: "new", clickedAt: newest }),
      ],
    });
    const result = await call(activityRouter.pendingOffers, undefined, {
      context: ctx,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      clickedAt: newest,
      contentId: "content-1",
      title: "A promotion",
      state: "pending",
    });
  });

  it("excludes ad-surface clicks and legacy taps on items with no offer placement", async () => {
    const ctx = pendingContext({
      conversions: [
        conversion({ id: "a", surface: "news-feed" }),
        conversion({ id: "b", surface: null }),
        conversion({ id: "c", surface: undefined }),
      ],
    });
    const result = await call(activityRouter.pendingOffers, undefined, {
      context: ctx,
    });
    expect(result).toEqual([]);
  });

  it("includes a legacy tap with no surface when the item has an offer placement", async () => {
    const ctx = pendingContext({
      partnerContent: [content({ placements: ["points-mall-apps"] })],
      conversions: [conversion({ surface: null })],
    });
    const result = await call(activityRouter.pendingOffers, undefined, {
      context: ctx,
    });
    expect(result).toHaveLength(1);
  });

  it("excludes an offer that has a settled conversion", async () => {
    const ctx = pendingContext({
      conversions: [
        conversion({ id: "a", clickedAt: hoursAgo(1) }),
        conversion({ id: "b", status: "awarded", clickedAt: hoursAgo(30) }),
      ],
    });
    const result = await call(activityRouter.pendingOffers, undefined, {
      context: ctx,
    });
    expect(result).toEqual([]);
  });

  it("ignores other users' conversions", async () => {
    const ctx = pendingContext({
      conversions: [conversion({ user: "someone-else" })],
    });
    expect(
      await call(activityRouter.pendingOffers, undefined, { context: ctx })
    ).toEqual([]);
  });

  it("reads the window from the partner and flags a lapsed one as not_confirmed", async () => {
    const ctx = pendingContext({
      conversions: [conversion({ clickedAt: hoursAgo(24 * 4) })],
    });
    const [offer] = await call(activityRouter.pendingOffers, undefined, {
      context: ctx,
    });
    expect(offer).toMatchObject({
      state: "not_confirmed",
      partnerName: "Acme",
      expectedWithinDays: 3,
    });
  });

  it("still returns an entry when the partner was deleted", async () => {
    const ctx = pendingContext({ conversions: [conversion()], partners: [] });
    const [offer] = await call(activityRouter.pendingOffers, undefined, {
      context: ctx,
    });
    expect(offer).toMatchObject({
      partnerName: null,
      expectedWithinDays: 7,
      state: "pending",
    });
  });

  it("skips a conversion whose content was deleted", async () => {
    const ctx = pendingContext({
      conversions: [conversion()],
      partnerContent: [],
    });
    expect(
      await call(activityRouter.pendingOffers, undefined, { context: ctx })
    ).toEqual([]);
  });

  it("handles populated partner and content objects", async () => {
    const ctx = pendingContext({
      partners: [],
      partnerContent: [],
      conversions: [
        conversion({
          partner: {
            id: "partner-1",
            companyName: "Acme",
            confirmationDays: 2,
          },
          content: { id: "content-9", title: "Populated" },
        }),
      ],
    });
    const [offer] = await call(activityRouter.pendingOffers, undefined, {
      context: ctx,
    });
    expect(offer).toMatchObject({
      contentId: "content-9",
      title: "Populated",
      partnerName: "Acme",
      expectedWithinDays: 2,
    });
  });

  it("orders newest first", async () => {
    const ctx = pendingContext({
      partnerContent: [
        content(),
        content({ id: "content-2", title: "Second" }),
      ],
      conversions: [
        conversion({ id: "a", content: "content-1", clickedAt: hoursAgo(5) }),
        conversion({ id: "b", content: "content-2", clickedAt: hoursAgo(1) }),
      ],
    });
    const result = await call(activityRouter.pendingOffers, undefined, {
      context: ctx,
    });
    expect(result.map((r) => r.contentId)).toEqual(["content-2", "content-1"]);
  });

  it("rejects a guest", async () => {
    const ctx = pendingContext({ conversions: [], user: guestUser });
    const error = await expectError(
      call(activityRouter.pendingOffers, undefined, { context: ctx })
    );
    expect(error).toBeDefined();
  });
});
