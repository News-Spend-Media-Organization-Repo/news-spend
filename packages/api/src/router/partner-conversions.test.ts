import { afterEach, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { call } from "@orpc/server";
import { canonicalString } from "../lib/partnerWebhookSignature";
import {
  createFakePayload as createBareFakePayload,
  type Doc,
  expectError,
  type FakePayloadOptions,
  mockContext,
  stubConversionClaims,
} from "../test-utils";
import { partnerConversionRouter } from "./partner-conversions";

/**
 * Settling a conversion claims it in the database first, so every fake payload
 * here answers the claim's statements the way the database would. A test that
 * wants to watch the statements, or lose the race, installs its own stub.
 */
function createFakePayload(options: FakePayloadOptions = {}) {
  const payload = createBareFakePayload(options);
  stubConversionClaims(payload);
  return payload;
}

const authedUser = { id: "user-1", isAnonymous: false, username: "tester" };
const guestUser = { id: "guest-1", isAnonymous: true, username: "guest" };
const CLICK_ID_RE = /^clk_[0-9a-f]{16}$/;

function partnerContent(overrides: Doc = {}): Doc {
  return {
    id: "pc1",
    title: "Test CPA",
    placements: ["points-mall-apps"],
    points: 50,
    links: { website: "https://from-content.com" },
    partner: { id: "p1", websiteUrl: "https://from-partner.com" },
    ...overrides,
  };
}

function conversion(overrides: Doc = {}): Doc {
  return {
    id: "conv1",
    user: "user-1",
    partner: "p1",
    content: "pc1",
    clickId: "clk_abc1234567890123",
    status: "clicked",
    pointsAwarded: 0,
    clickedAt: new Date().toISOString(),
    ...overrides,
  };
}

const WEBHOOK_SECRET = "test-partner-secret";

function partner(overrides: Doc = {}): Doc {
  return {
    id: "p1",
    websiteUrl: "https://example.com",
    webhookSecret: WEBHOOK_SECRET,
    ...overrides,
  };
}

/**
 * Headers a partner would send. The postback is signed now, so a test that
 * calls it unsigned is testing the rejection, not the behaviour.
 */
function signedHeaders({
  clickId = "clk_abc1234567890123",
  status = "success",
  secret = WEBHOOK_SECRET,
}: {
  clickId?: string;
  status?: string;
  secret?: string;
} = {}): Headers {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(canonicalString({ timestamp, clickId, status }), "utf-8")
    .digest("hex");
  return new Headers({ "x-signature": signature, "x-timestamp": timestamp });
}

// ---- trackClick ----

describe("partnerConversionRouter.trackClick", () => {
  it("rejects an unauthenticated caller", async () => {
    const payload = createFakePayload({ collections: {} });
    const ctx = mockContext({ payload });

    const error = await expectError(
      call(
        partnerConversionRouter.trackClick,
        { partnerContentId: "pc1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a guest caller", async () => {
    const payload = createFakePayload({ collections: {} });
    const ctx = mockContext({ user: guestUser as never, payload });

    const error = await expectError(
      call(
        partnerConversionRouter.trackClick,
        { partnerContentId: "pc1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("FORBIDDEN");
  });

  it("throws NOT_FOUND when content does not exist", async () => {
    const payload = createFakePayload({
      collections: { "partner-content": [] },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        partnerConversionRouter.trackClick,
        { partnerContentId: "missing" },
        { context: ctx }
      )
    );

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "Partner content not found",
    });
  });

  it("throws BAD_REQUEST when content has no partner", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-content": [partnerContent({ partner: null })],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        partnerConversionRouter.trackClick,
        { partnerContentId: "pc1" },
        { context: ctx }
      )
    );

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Partner content has no associated partner",
    });
  });

  it("creates a conversion and returns clickId with correct format", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-content": [partnerContent()],
        partners: [partner()],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: ctx }
    );

    expect(result.success).toBe(true);
    expect(result.clickId).toMatch(CLICK_ID_RE);
    // Conversion record created
    const convDoc = payload.docs("partner-conversions")[0];
    expect(convDoc).toMatchObject({
      user: "user-1",
      partner: "p1",
      content: "pc1",
      status: "clicked",
      pointsAwarded: 0,
    });
    expect(convDoc?.clickId).toMatch(CLICK_ID_RE);
  });

  it("prefers content.links.website over partner.websiteUrl for redirectUrl", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-content": [
          partnerContent({
            links: { website: "https://content-link.com" },
            partner: { id: "p1" },
          }),
        ],
        partners: [partner({ websiteUrl: "https://partner-link.com" })],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: ctx }
    );

    expect(result.redirectUrl).toBe("https://content-link.com");
  });

  it("falls back to partner.websiteUrl when content has no links.website", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-content": [
          partnerContent({ links: undefined, partner: { id: "p1" } }),
        ],
        partners: [partner({ websiteUrl: "https://partner-url.com" })],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: ctx }
    );

    expect(result.redirectUrl).toBe("https://partner-url.com");
  });

  it("handles partner as string id", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-content": [partnerContent({ partner: "p1" })],
        partners: [partner({ id: "p1" })],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: ctx }
    );

    expect(result.success).toBe(true);
    const convDoc = payload.docs("partner-conversions")[0];
    expect(convDoc?.partner).toBe("p1");
  });
});

// ---- webhook ----

describe("partnerConversionRouter.webhook", () => {
  it("throws NOT_FOUND when clickId does not exist", async () => {
    const payload = createFakePayload({
      collections: { "partner-conversions": [], partners: [partner()] },
    });
    const ctx = mockContext({ payload, headers: signedHeaders() });

    const error = await expectError(
      call(
        partnerConversionRouter.webhook,
        { clickId: "clk_nonexistent", status: "success" },
        { context: ctx }
      )
    );

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "Click ID not found",
    });
  });

  it("returns already-processed when status is already converted", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion({ status: "converted" })],
        partners: [partner()],
      },
    });
    const ctx = mockContext({ payload, headers: signedHeaders() });

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: ctx }
    );

    expect(result).toEqual({
      success: true,
      message: "Already processed",
      clickId: "clk_abc1234567890123",
    });
    // No create or update writes should have happened (only the initial find)
    const writeCalls = payload.calls.filter(
      (c) => c.op === "create" || c.op === "update"
    );
    expect(writeCalls).toHaveLength(0);
  });

  it("returns already-processed when status is already awarded", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion({ status: "awarded" })],
        partners: [partner()],
      },
    });
    const ctx = mockContext({ payload, headers: signedHeaders() });

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: ctx }
    );

    expect(result).toEqual({
      success: true,
      message: "Already processed",
      clickId: "clk_abc1234567890123",
    });
    const writeCalls = payload.calls.filter(
      (c) => c.op === "create" || c.op === "update"
    );
    expect(writeCalls).toHaveLength(0);
  });

  it("updates conversion to failed when status is failed", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
      },
    });
    const ctx = mockContext({
      payload,
      headers: signedHeaders({ status: "failed" }),
    });

    const result = await call(
      partnerConversionRouter.webhook,
      {
        clickId: "clk_abc1234567890123",
        status: "failed",
        partnerOrderId: "order-1",
      },
      { context: ctx }
    );

    expect(result).toEqual({
      success: true,
      clickId: "clk_abc1234567890123",
      status: "failed",
      pointsAwarded: 0,
    });
    // Conversion should be updated to failed
    const updatedConv = payload.docs("partner-conversions")[0];
    expect(updatedConv?.status).toBe("failed");
    expect(updatedConv?.partnerOrderId).toBe("order-1");
    // No activity created
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("awards points and creates activity on success with points > 0", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [
          partnerContent({ points: 50, title: "Install App" }),
        ],
      },
    });
    const ctx = mockContext({ payload, headers: signedHeaders() });

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: ctx }
    );

    expect(result).toEqual({
      success: true,
      clickId: "clk_abc1234567890123",
      status: "converted",
      pointsAwarded: 50,
    });
    // Activity created
    const activityDoc = payload.docs("activities")[0];
    expect(activityDoc).toMatchObject({
      user: "user-1",
      type: "point",
      action: "partnerContentTask",
      point: 50,
    });
    // Conversion updated to awarded
    const updatedConv = payload.docs("partner-conversions")[0];
    expect(updatedConv?.status).toBe("awarded");
    expect(updatedConv?.pointsAwarded).toBe(50);
  });

  it("does not award points when content has 0 points", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 0 })],
      },
    });
    const ctx = mockContext({ payload, headers: signedHeaders() });

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: ctx }
    );

    expect(result.pointsAwarded).toBe(0);
    expect(result.status).toBe("converted");
    // No activity created
    expect(payload.docs("activities")).toHaveLength(0);
    // Conversion NOT awarded (stays converted, not upgraded to awarded)
    const updatedConv = payload.docs("partner-conversions")[0];
    expect(updatedConv?.status).toBe("converted");
  });

  it("does not award points above the activity ceiling", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 5001 })],
      },
    });
    const logs: unknown[] = [];
    payload.logger.error = (...args: unknown[]) => logs.push(args);
    const ctx = mockContext({ payload, headers: signedHeaders() });

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: ctx }
    );

    expect(result).toEqual({
      success: true,
      clickId: "clk_abc1234567890123",
      status: "converted",
      pointsAwarded: 0,
    });
    expect(payload.docs("activities")).toHaveLength(0);
    const updatedConv = payload.docs("partner-conversions")[0];
    expect(updatedConv?.status).toBe("converted");
    expect(updatedConv?.pointsAwarded).toBe(0);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("still settles when the partner content was deleted since the click", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion({ content: "gone" })],
        partners: [partner()],
        "partner-content": [],
      },
    });
    const ctx = mockContext({ payload, headers: signedHeaders() });

    // Payload throws NotFound for an unknown id, which would surface as a 500
    // to the partner and make them retry a postback that can never succeed.
    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: ctx }
    );

    expect(result.status).toBe("converted");
    expect(result.pointsAwarded).toBe(0);
  });

  it("handles content as string id in conversion", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion({ content: "pc1" })],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 10 })],
      },
    });
    const ctx = mockContext({ payload, headers: signedHeaders() });

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: ctx }
    );

    expect(result.status).toBe("converted");
    expect(result.pointsAwarded).toBe(10);
  });
});

describe("partnerConversionRouter.webhook: verification", () => {
  it("refuses an unsigned postback", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
      },
    });
    const ctx = mockContext({ payload });

    const error = await expectError(
      call(
        partnerConversionRouter.webhook,
        { clickId: "clk_abc1234567890123", status: "success" },
        { context: ctx }
      )
    );

    // The state this shipped in: clickId is handed to the app, so anyone
    // could post their own back and award themselves points and the Featured
    // Offer that gates Tier 1 and Tier 2.
    expect(error).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("writes nothing when verification fails", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
      },
    });
    const ctx = mockContext({ payload });

    await expectError(
      call(
        partnerConversionRouter.webhook,
        { clickId: "clk_abc1234567890123", status: "success" },
        { context: ctx }
      )
    );

    const writes = payload.calls.filter(
      (c) => c.op === "create" || c.op === "update"
    );
    expect(writes).toHaveLength(0);
  });

  it("refuses a signature made with another partner's secret", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
      },
    });
    const ctx = mockContext({
      payload,
      headers: signedHeaders({ secret: "some-other-partners-secret" }),
    });

    const error = await expectError(
      call(
        partnerConversionRouter.webhook,
        { clickId: "clk_abc1234567890123", status: "success" },
        { context: ctx }
      )
    );

    expect(error).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("partnerConversionRouter.webhook: dry run", () => {
  it("confirms a valid signature without settling the conversion", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
      },
    });
    const ctx = mockContext({ payload, headers: signedHeaders() });

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success", dryRun: true },
      { context: ctx }
    );

    expect(result).toEqual({
      success: true,
      clickId: "clk_abc1234567890123",
      dryRun: true,
      message: "Signature verified. No conversion was settled.",
    });
    // Nothing changed: still "clicked", no points, no activity.
    const untouchedConv = payload.docs("partner-conversions")[0];
    expect(untouchedConv?.status).toBe("clicked");
    expect(untouchedConv?.pointsAwarded).toBe(0);
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("still refuses an unsigned dry run", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
      },
    });
    const ctx = mockContext({ payload, headers: new Headers() });

    const error = await expectError(
      call(
        partnerConversionRouter.webhook,
        { clickId: "clk_abc1234567890123", status: "success", dryRun: true },
        { context: ctx }
      )
    );

    expect(error).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not record a postback outcome for a dry run", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
      },
    });
    const ctx = mockContext({ payload, headers: signedHeaders() });
    const drizzle = stubConversionClaims(payload);

    await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success", dryRun: true },
      { context: ctx }
    );

    expect(drizzle.queries).toHaveLength(0);
  });
});

describe("partnerConversionRouter.trackClick: award on click", () => {
  function clickPayload(partnerOverrides: Doc = {}) {
    return createFakePayload({
      collections: {
        "partner-content": [
          partnerContent({
            id: "pc1",
            points: 50,
            partner: "p1",
            placements: ["points-mall-apps", "news-click-ads"],
          }),
        ],
        partners: [partner(partnerOverrides)],
        "partner-conversions": [],
        activities: [],
        giveaways: [],
        "giveaway-engagements": [],
      },
    });
  }

  it("leaves a click as only a click by default", async () => {
    const payload = clickPayload();
    const ctx = mockContext({ payload, user: { id: "user-1" } as never });

    await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: ctx }
    );

    // 8 counts completions, not intentions. Without a partner saying so, a
    // tap stays a tap.
    expect(payload.docs("partner-conversions")[0]?.status).toBe("clicked");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("settles the conversion when the partner cannot post back", async () => {
    const payload = clickPayload({ awardOnClick: true });
    const ctx = mockContext({ payload, user: { id: "user-1" } as never });

    await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: ctx }
    );

    const conv = payload.docs("partner-conversions")[0];
    expect(conv?.status).toBe("awarded");
    expect(conv?.pointsAwarded).toBe(50);
    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("still redirects when settling the click fails", async () => {
    // The person is waiting on a redirect; bookkeeping must not strand them.
    const payload = clickPayload({ awardOnClick: true });

    /**
     * Break the points write specifically. An earlier version of this test
     * called a `failOn` helper that does not exist, and the optional chaining
     * meant it asserted against a perfectly healthy payload (green, and
     * proving nothing.
     */
    const realCreate = payload.create.bind(payload);
    payload.create = (async (args: any) => {
      if (args?.collection === "activities") {
        throw new Error("activities is unavailable");
      }
      return realCreate(args);
    }) as typeof payload.create;

    const ctx = mockContext({ payload, user: { id: "user-1" } as never });

    const result = await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: ctx }
    );

    expect(result.success).toBe(true);
    expect(result.redirectUrl).toBeTruthy();
    // The click is still on record even though the award could not complete.
    expect(payload.docs("partner-conversions")).toHaveLength(1);
  });

  it("credits an offer once however many times it is opened", async () => {
    const payload = clickPayload({ awardOnClick: true });
    const ctx = mockContext({ payload, user: { id: "user-1" } as never });

    for (let i = 0; i < 4; i += 1) {
      await call(
        partnerConversionRouter.trackClick,
        { partnerContentId: "pc1" },
        { context: ctx }
      );
    }

    // Every tap is still recorded (that is what click tracking is), but only
    // the first one pays. Points buy giveaway tickets, so an uncapped version
    // of this is an unlimited supply of draw entries.
    expect(payload.docs("partner-conversions")).toHaveLength(4);
    expect(payload.docs("activities")).toHaveLength(1);
    expect(payload.docs("activities")[0]?.point).toBe(50);
  });

  it("does not stop a different person earning the same offer", async () => {
    const payload = clickPayload({ awardOnClick: true });

    await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: mockContext({ payload, user: { id: "user-1" } as never }) }
    );
    await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: mockContext({ payload, user: { id: "user-2" } as never }) }
    );

    expect(payload.docs("activities")).toHaveLength(2);
  });
});

describe("partnerConversionRouter.trackClick: surface-gated payment", () => {
  const setup = (partnerOverrides: Doc = { awardOnClick: true }) =>
    createFakePayload({
      collections: {
        "partner-content": [
          partnerContent({
            id: "pc1",
            points: 50,
            partner: "p1",
            placements: ["points-mall-apps", "news-click-ads"],
          }),
        ],
        partners: [partner(partnerOverrides)],
        "partner-conversions": [],
        activities: [],
        giveaways: [],
        "giveaway-engagements": [],
      },
    });
  const tap = (
    payload: ReturnType<typeof setup>,
    input: Doc,
    userId = "user-1"
  ) =>
    call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1", ...input } as never,
      { context: mockContext({ payload, user: { id: userId } as never }) }
    );

  it("records the surface and pays nothing from a click ad", async () => {
    const payload = setup();
    await tap(payload, { surface: "news-click-ads" });
    const conv = payload.docs("partner-conversions")[0];
    expect(conv?.surface).toBe("news-click-ads");
    expect(conv?.status).toBe("clicked");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("pays from an offer surface the item is placed on", async () => {
    const payload = setup();
    await tap(payload, { surface: "points-mall-apps" });
    expect(payload.docs("partner-conversions")[0]?.surface).toBe(
      "points-mall-apps"
    );
    expect(payload.docs("activities")).toHaveLength(1);
    expect(payload.docs("activities")[0]?.point).toBe(50);
  });

  it("records the click but pays nothing on an offer surface the item is not on", async () => {
    const payload = setup();
    await tap(payload, { surface: "lucky-app-wall" });
    expect(payload.docs("partner-conversions")).toHaveLength(1);
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("pays with no surface when the item has an offer placement", async () => {
    const payload = setup();
    await tap(payload, {});
    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("pays nothing with no surface when the item is placed on ads only", async () => {
    const payload = setup();
    payload.docs("partner-content")[0]!.placements = ["news-click-ads"];
    await tap(payload, {});
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("does not pay a second offer-surface tap", async () => {
    const payload = setup();
    await tap(payload, { surface: "points-mall-apps" });
    await tap(payload, { surface: "points-mall-apps" });
    expect(payload.docs("partner-conversions")).toHaveLength(2);
    expect(payload.docs("activities")).toHaveLength(1);
  });
});

describe("partnerConversionRouter.trackClick: REQUIRE_TAP_SURFACE", () => {
  const original = process.env.REQUIRE_TAP_SURFACE;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.REQUIRE_TAP_SURFACE;
    } else {
      process.env.REQUIRE_TAP_SURFACE = original;
    }
  });

  const setup = () =>
    createFakePayload({
      collections: {
        "partner-content": [
          partnerContent({
            id: "pc1",
            points: 50,
            partner: "p1",
            placements: ["points-mall-apps", "news-click-ads"],
          }),
        ],
        partners: [partner({ awardOnClick: true })],
        "partner-conversions": [],
        activities: [],
        giveaways: [],
        "giveaway-engagements": [],
      },
    });
  const tap = (payload: ReturnType<typeof setup>, input: Doc = {}) =>
    call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1", ...input } as never,
      { context: mockContext({ payload, user: { id: "user-1" } as never }) }
    );

  it("off: a surface-less tap still pays and stores a null surface", async () => {
    delete process.env.REQUIRE_TAP_SURFACE;
    const payload = setup();
    await tap(payload);
    expect(payload.docs("partner-conversions")[0]?.surface).toBeNull();
    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("on: a surface-less tap pays nothing and is stored as unknown", async () => {
    process.env.REQUIRE_TAP_SURFACE = "true";
    const payload = setup();
    await tap(payload);
    const conv = payload.docs("partner-conversions")[0];
    expect(conv?.surface).toBe("unknown");
    expect(conv?.status).toBe("clicked");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("on: an explicit offer-surface tap still pays once and is stored as sent", async () => {
    process.env.REQUIRE_TAP_SURFACE = "1";
    const payload = setup();
    await tap(payload, { surface: "points-mall-apps" });
    expect(payload.docs("partner-conversions")[0]?.surface).toBe(
      "points-mall-apps"
    );
    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("on: an explicit ad-surface tap still pays nothing and is stored as sent", async () => {
    process.env.REQUIRE_TAP_SURFACE = "1";
    const payload = setup();
    await tap(payload, { surface: "news-click-ads" });
    expect(payload.docs("partner-conversions")[0]?.surface).toBe(
      "news-click-ads"
    );
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("on: a postback for a surface-less tap pays nothing and leaves it clicked", async () => {
    process.env.REQUIRE_TAP_SURFACE = "true";
    const payload = setup();
    const { clickId } = await tap(payload);
    const result = await call(
      partnerConversionRouter.webhook,
      { clickId, status: "success" },
      {
        context: mockContext({
          payload,
          headers: signedHeaders({ clickId }),
        }),
      }
    );
    expect(result).toEqual({
      success: true,
      clickId,
      message: "Ignored: not an offer surface",
      pointsAwarded: 0,
    });
    expect(payload.docs("activities")).toHaveLength(0);
    expect(payload.docs("partner-conversions")[0]?.status).toBe("clicked");
  });

  it("on: a postback for a conversion clicked before the switch (null surface) still pays", async () => {
    process.env.REQUIRE_TAP_SURFACE = "true";
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion({ surface: null })],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
        activities: [],
      },
    });
    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: mockContext({ payload, headers: signedHeaders() }) }
    );
    expect(result).toMatchObject({ status: "converted", pointsAwarded: 50 });
    expect(payload.docs("activities")).toHaveLength(1);
  });
});

describe("partnerConversionRouter.webhook: surface and one-time settlement", () => {
  const CLICK = "clk_abc1234567890123";
  const run = (
    conversions: Doc[],
    clickId = CLICK,
    contentOverrides: Doc = {}
  ) => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": conversions,
        partners: [partner()],
        "partner-content": [
          partnerContent({ points: 50, ...contentOverrides }),
        ],
        activities: [],
      },
    });
    const drizzle = stubConversionClaims(payload);
    const ctx = mockContext({ payload, headers: signedHeaders({ clickId }) });
    return { payload, drizzle, ctx, clickId };
  };

  it("pays nothing for a conversion from a click ad and leaves it clicked", async () => {
    const { payload, drizzle, ctx } = run([
      conversion({ surface: "news-click-ads" }),
    ]);
    const warnings: unknown[] = [];
    payload.logger.warn = () => {
      warnings.push(1);
    };

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: CLICK, status: "success" },
      { context: ctx }
    );

    expect(result).toEqual({
      success: true,
      clickId: CLICK,
      message: "Ignored: not an offer surface",
      pointsAwarded: 0,
    });
    expect(payload.docs("activities")).toHaveLength(0);
    expect(payload.docs("partner-conversions")[0]?.status).toBe("clicked");
    expect(warnings.length).toBeGreaterThan(0);
    expect(drizzle.queries).toHaveLength(0);
  });

  it("pays nothing for a conversion with no stored surface on an ads-only item", async () => {
    const { payload, ctx } = run([conversion({ surface: null })], CLICK, {
      placements: ["homepage-ads-banner"],
    });
    const warnings: unknown[] = [];
    payload.logger.warn = () => {
      warnings.push(1);
    };
    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: CLICK, status: "success" },
      { context: ctx }
    );
    expect(result).toEqual({
      success: true,
      clickId: CLICK,
      message: "Ignored: not an offer surface",
      pointsAwarded: 0,
    });
    expect(payload.docs("activities")).toHaveLength(0);
    expect(payload.docs("partner-conversions")[0]?.status).toBe("clicked");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("settles a conversion with no stored surface when the item has an offer placement", async () => {
    const { payload, ctx } = run([conversion({ surface: null })], CLICK, {
      placements: ["points-mall-apps"],
    });
    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: CLICK, status: "success" },
      { context: ctx }
    );
    expect(result).toMatchObject({ status: "converted", pointsAwarded: 50 });
    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("pays a conversion from an offer surface", async () => {
    const { payload, ctx } = run([conversion({ surface: "points-mall-apps" })]);
    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: CLICK, status: "success" },
      { context: ctx }
    );
    expect(result).toMatchObject({ status: "converted", pointsAwarded: 50 });
    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("still records a failed postback from a click ad as failed", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion({ surface: "news-click-ads" })],
        partners: [partner()],
        "partner-content": [partnerContent()],
      },
    });
    const ctx = mockContext({
      payload,
      headers: signedHeaders({ status: "failed" }),
    });
    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: CLICK, status: "failed" },
      { context: ctx }
    );
    expect(result).toMatchObject({ status: "failed", pointsAwarded: 0 });
  });

  it("pays two conversions of one offer once, recording the second as a duplicate", async () => {
    const { payload, drizzle, ctx } = run([
      conversion({ id: "conv1", clickId: CLICK, surface: "points-mall-apps" }),
      conversion({
        id: "conv2",
        clickId: "clk_second000000001",
        surface: "points-mall-apps",
      }),
    ]);

    await call(
      partnerConversionRouter.webhook,
      { clickId: CLICK, status: "success" },
      { context: ctx }
    );
    const second = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_second000000001", status: "success" },
      {
        context: mockContext({
          payload,
          headers: signedHeaders({ clickId: "clk_second000000001" }),
        }),
      }
    );

    expect(second).toEqual({
      success: true,
      message: "Already processed",
      clickId: "clk_second000000001",
    });
    expect(payload.docs("activities")).toHaveLength(1);
    const convs = payload.docs("partner-conversions");
    expect(convs.find((c) => c.id === "conv2")?.status).toBe("clicked");
    expect(
      drizzle.queries.some(
        (q) =>
          q.sql.includes("duplicate") && q.sql.includes("clk_second000000001")
      )
    ).toBe(true);
  });
});

// ---- what became of each postback is recorded ----

describe("partnerConversionRouter.webhook records what became of each postback", () => {
  const CLICK = "clk_abc1234567890123";
  // The postback table stores the partner as a UUID.
  const PARTNER_ID = "11111111-1111-4111-8111-111111111111";

  const setup = (overrides: Doc = {}, headers: Headers = signedHeaders()) => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [
          conversion({ partner: PARTNER_ID, ...overrides }),
        ],
        partners: [partner({ id: PARTNER_ID })],
        "partner-content": [partnerContent({ points: 50 })],
        activities: [],
      },
    });
    const drizzle = stubConversionClaims(payload);
    const ctx = mockContext({ payload, headers });
    return { payload, drizzle, ctx };
  };

  const input = (status: "success" | "failed" = "success") => ({
    clickId: CLICK,
    status,
  });

  /** The single INSERT into partner_postbacks, or undefined when there was none. */
  const insertOf = (queries: { sql: string }[]) =>
    queries.find((q) => q.sql.includes("partner_postbacks"));

  it("records an accepted postback", async () => {
    const { drizzle, ctx } = setup();

    await call(partnerConversionRouter.webhook, input(), { context: ctx });

    const insert = insertOf(drizzle.queries);
    expect(insert?.sql).toContain("accepted");
    expect(insert?.sql).toContain(PARTNER_ID);
    expect(insert?.sql).toContain(CLICK);
  });

  it("records a failure the partner reported", async () => {
    const { drizzle, ctx } = setup({}, signedHeaders({ status: "failed" }));

    await call(partnerConversionRouter.webhook, input("failed"), {
      context: ctx,
    });

    expect(insertOf(drizzle.queries)?.sql).toContain("failed_reported");
  });

  it("records a repeat of one already processed", async () => {
    const { drizzle, ctx } = setup({ status: "awarded" });

    await call(partnerConversionRouter.webhook, input(), { context: ctx });

    expect(insertOf(drizzle.queries)?.sql).toContain("duplicate");
  });

  it("records a rejected postback with our own reason, and still refuses it", async () => {
    const { drizzle, ctx } = setup(
      {},
      signedHeaders({ secret: "the-wrong-secret" })
    );

    const error = await expectError(
      call(partnerConversionRouter.webhook, input(), { context: ctx })
    );

    expect(error).toMatchObject({ code: "UNAUTHORIZED" });
    const insert = insertOf(drizzle.queries);
    expect(insert?.sql).toContain("rejected");
    expect(insert?.sql).toContain("signature does not match");
  });

  it("does not tell the caller why a postback was rejected", async () => {
    const { ctx } = setup({}, signedHeaders({ secret: "wrong" }));

    const error = await expectError(
      call(partnerConversionRouter.webhook, input(), { context: ctx })
    );

    expect(JSON.stringify(error)).not.toContain("signature does not match");
  });

  it("records nothing for a click that does not exist, so the public endpoint cannot be used to fill the table", async () => {
    const { drizzle, ctx } = setup({ clickId: "clk_someone_else" });

    await expectError(
      call(partnerConversionRouter.webhook, input(), { context: ctx })
    );

    expect(insertOf(drizzle.queries)).toBeUndefined();
  });

  it("keeps one row per click and outcome, so a retry is not counted again", async () => {
    const { drizzle, ctx } = setup();

    await call(partnerConversionRouter.webhook, input(), { context: ctx });

    expect(insertOf(drizzle.queries)?.sql).toContain(
      "ON CONFLICT (click_id, outcome) DO NOTHING"
    );
  });

  it("never lets a failure to record change what the postback does", async () => {
    // A database that refuses the insert must not turn a paid conversion into an
    // error, or the partner would retry one we already settled.
    const { payload, ctx } = setup();
    // Only the postback log is broken; the claim runs in its own transaction.
    const { transaction } = payload.db.drizzle as { transaction: unknown };
    Object.assign(payload.db, {
      drizzle: {
        transaction,
        execute: () => Promise.reject(new Error("disk full")),
      },
    });

    const result = await call(partnerConversionRouter.webhook, input(), {
      context: ctx,
    });

    expect(result).toMatchObject({ success: true, status: "converted" });
    expect(payload.docs("partner-conversions")[0]?.status).toBe("awarded");
  });
});

describe("partnerConversionRouter: a claim lost to a concurrent settlement", () => {
  const CLICK = "clk_abc1234567890123";
  const PARTNER_ID = "11111111-1111-4111-8111-111111111111";

  const losingRace = (
    conversionOverrides: Doc = {},
    partnerOverrides: Doc = {}
  ) => {
    const payload = createBareFakePayload({
      collections: {
        "partner-conversions": [
          conversion({ partner: PARTNER_ID, ...conversionOverrides }),
        ],
        partners: [partner({ id: PARTNER_ID, ...partnerOverrides })],
        "partner-content": [
          partnerContent({ points: 50, partner: PARTNER_ID }),
        ],
        activities: [],
        giveaways: [],
        "giveaway-engagements": [],
      },
    });
    // The handler's own pre-check saw nothing settled; the claim finds a
    // sibling that committed in between.
    const drizzle = stubConversionClaims(payload, { refuse: true });
    return { payload, drizzle };
  };

  it("answers a postback as already processed, pays nothing, and records a duplicate", async () => {
    const { payload, drizzle } = losingRace();

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: CLICK, status: "success" },
      { context: mockContext({ payload, headers: signedHeaders() }) }
    );

    expect(result).toEqual({
      success: true,
      message: "Already processed",
      clickId: CLICK,
    });
    expect(payload.docs("activities")).toHaveLength(0);
    expect(payload.docs("partner-conversions")[0]?.status).toBe("clicked");
    const recorded = drizzle.queries.filter((q) =>
      q.sql.includes("partner_postbacks")
    );
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.params).toContain("duplicate");
  });

  it("does not record a Featured Offer for a refused claim", async () => {
    const { payload } = losingRace();

    await call(
      partnerConversionRouter.webhook,
      { clickId: CLICK, status: "success" },
      { context: mockContext({ payload, headers: signedHeaders() }) }
    );

    expect(
      payload.calls.some(
        (c) => c.op === "create" && c.collection === "giveaway-engagements"
      )
    ).toBe(false);
  });

  it("lets a database error in the claim reach the partner so they retry", async () => {
    const { payload } = losingRace();
    Object.assign(payload.db, {
      drizzle: {
        execute: () => Promise.reject(new Error("connection lost")),
        transaction: () => Promise.reject(new Error("connection lost")),
      },
    });

    await expect(
      call(
        partnerConversionRouter.webhook,
        { clickId: CLICK, status: "success" },
        { context: mockContext({ payload, headers: signedHeaders() }) }
      )
    ).rejects.toThrow("connection lost");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("pays nothing for an award-on-click tap, and still redirects", async () => {
    const payload = createBareFakePayload({
      collections: {
        "partner-content": [
          partnerContent({
            id: "pc1",
            points: 50,
            partner: "p1",
            placements: ["points-mall-apps"],
          }),
        ],
        partners: [partner({ awardOnClick: true })],
        "partner-conversions": [],
        activities: [],
        giveaways: [],
        "giveaway-engagements": [],
      },
    });
    stubConversionClaims(payload, { refuse: true });

    const result = await call(
      partnerConversionRouter.trackClick,
      { partnerContentId: "pc1" },
      { context: mockContext({ payload, user: { id: "user-1" } as never }) }
    );

    expect(result.success).toBe(true);
    expect(payload.docs("activities")).toHaveLength(0);
    expect(payload.docs("partner-conversions")[0]?.status).toBe("clicked");
  });
});

describe("partnerConversionRouter.webhook: failed, then success", () => {
  const CLICK = "clk_abc1234567890123";

  it("still pays a click the partner first reported failed, once", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion()],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
        activities: [],
      },
    });
    const send = (status: "failed" | "success") =>
      call(
        partnerConversionRouter.webhook,
        { clickId: CLICK, status },
        {
          context: mockContext({ payload, headers: signedHeaders({ status }) }),
        }
      );

    expect(await send("failed")).toMatchObject({ status: "failed" });
    const result = await send("success");

    expect(result).toMatchObject({ status: "converted", pointsAwarded: 50 });
    expect(payload.docs("activities")).toHaveLength(1);
    expect(payload.docs("partner-conversions")[0]?.status).toBe("awarded");
  });
});

describe("partnerConversionRouter.webhook: a conversion with no user", () => {
  it("settles without a claim and credits nothing", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion({ user: null })],
        partners: [partner()],
        "partner-content": [partnerContent({ points: 50 })],
        activities: [],
      },
    });

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: mockContext({ payload, headers: signedHeaders() }) }
    );

    expect(result).toMatchObject({ status: "converted", pointsAwarded: 0 });
    expect(payload.docs("activities")).toHaveLength(0);
    expect(payload.docs("partner-conversions")[0]?.status).toBe("converted");
  });
});
