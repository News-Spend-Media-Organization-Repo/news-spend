import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import {
  createFakePayload,
  type Doc,
  expectError,
  mockContext,
} from "../test-utils";
import { partnerConversionRouter } from "./partner-conversions";

const authedUser = { id: "user-1", isAnonymous: false, username: "tester" };
const guestUser = { id: "guest-1", isAnonymous: true, username: "guest" };
const CLICK_ID_RE = /^clk_[0-9a-f]{16}$/;

function partnerContent(overrides: Doc = {}): Doc {
  return {
    id: "pc1",
    title: "Test CPA",
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

function partner(overrides: Doc = {}): Doc {
  return {
    id: "p1",
    websiteUrl: "https://example.com",
    ...overrides,
  };
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
      collections: { "partner-conversions": [] },
    });
    const ctx = mockContext({ payload });

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
      },
    });
    const ctx = mockContext({ payload });

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
      },
    });
    const ctx = mockContext({ payload });

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
        "partner-content": [partnerContent({ points: 50 })],
      },
    });
    const ctx = mockContext({ payload });

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
        "partner-content": [
          partnerContent({ points: 50, title: "Install App" }),
        ],
      },
    });
    const ctx = mockContext({ payload });

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
        "partner-content": [partnerContent({ points: 0 })],
      },
    });
    const ctx = mockContext({ payload });

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

  it("handles content as string id in conversion", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-conversions": [conversion({ content: "pc1" })],
        "partner-content": [partnerContent({ points: 10 })],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      partnerConversionRouter.webhook,
      { clickId: "clk_abc1234567890123", status: "success" },
      { context: ctx }
    );

    expect(result.status).toBe("converted");
    expect(result.pointsAwarded).toBe(10);
  });
});
