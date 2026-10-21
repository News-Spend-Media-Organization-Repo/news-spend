import { afterEach, describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import {
  createFakePayload,
  expectError,
  mockContext,
  stubDrizzle,
} from "../test-utils";
import { REVIEW_RATE_LIMIT, reviewRouter } from "./review";

const DAY_MS = 24 * 60 * 60 * 1000;

function userNamed(id: string, ageDays = 30) {
  return {
    id,
    isAnonymous: false,
    createdAt: new Date(Date.now() - ageDays * DAY_MS),
  };
}

type Scenario = {
  /** `users.review_prompted_at` as the database would return it. */
  promptedAt?: Date | null;
  /** Rows the engagement query returns. */
  engagement?: { active_days: number; sessions: number; has_activity: boolean };
  /** Whether the atomic update finds a row to claim. */
  claimable?: boolean;
};

function setup(userId: string, scenario: Scenario = {}, ageDays = 30) {
  const payload = createFakePayload({
    collections: { users: [{ id: userId }] },
  });
  const { queries } = stubDrizzle(payload, (query) => {
    if (query.sql.includes("RETURNING")) {
      return scenario.claimable === false ? [] : [{ id: userId }];
    }
    if (query.sql.includes("news_analytics")) {
      return [
        scenario.engagement ?? {
          active_days: 7,
          sessions: 10,
          has_activity: true,
        },
      ];
    }
    return [{ review_prompted_at: scenario.promptedAt ?? null }];
  });
  const ctx = mockContext({
    user: userNamed(userId, ageDays) as never,
    payload,
  });
  return { ctx, queries };
}

const ranUpdate = (queries: { sql: string }[]) =>
  queries.some((q) => q.sql.includes("RETURNING"));
const ranEngagement = (queries: { sql: string }[]) =>
  queries.some((q) => q.sql.includes("news_analytics"));

afterEach(() => {
  // Assigning undefined would store the string "undefined", so delete it.
  delete process.env.REVIEW_PROMPTS_ENABLED;
});

describe("review.recordPrompt", () => {
  it("wins when the user has never been prompted", async () => {
    const { ctx } = setup("never-prompted");

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "PRIZE_CLAIMED" },
      { context: ctx }
    );

    expect(result).toEqual({ won: true });
  });

  it("loses with cooldown inside 90 days and does not run the update", async () => {
    const { ctx, queries } = setup("recent", {
      promptedAt: new Date(Date.now() - 10 * DAY_MS),
    });

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "PRIZE_CLAIMED" },
      { context: ctx }
    );

    expect(result).toEqual({ won: false, reason: "cooldown" });
    expect(ranUpdate(queries)).toBe(false);
  });

  it("wins when the last prompt is older than 90 days", async () => {
    const { ctx } = setup("stale", {
      promptedAt: new Date(Date.now() - 91 * DAY_MS),
    });

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "PRIZE_DELIVERED" },
      { context: ctx }
    );

    expect(result).toEqual({ won: true });
  });

  it("loses when the atomic update claims no row (a concurrent call won)", async () => {
    const { ctx } = setup("raced", { claimable: false });

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "PRIZE_CLAIMED" },
      { context: ctx }
    );

    expect(result).toEqual({ won: false, reason: "cooldown" });
  });

  it("makes the cap check conditional in the update itself", async () => {
    const { ctx, queries } = setup("sql-shape");

    await call(
      reviewRouter.recordPrompt,
      { trigger: "PRIZE_CLAIMED" },
      { context: ctx }
    );

    const update = queries.find((q) => q.sql.includes("RETURNING"));
    expect(update?.sql).toContain("review_prompted_at");
    expect(update?.sql).toContain("IS NULL");
  });

  it("prize triggers never run the engagement query", async () => {
    const { ctx, queries } = setup("prize-only");

    await call(
      reviewRouter.recordPrompt,
      { trigger: "PRIZE_CLAIMED" },
      { context: ctx }
    );

    expect(ranEngagement(queries)).toBe(false);
  });

  it("LOYAL_USER wins when every threshold is met", async () => {
    const { ctx } = setup("loyal", {}, 7);

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "LOYAL_USER" },
      { context: ctx }
    );

    expect(result).toEqual({ won: true });
  });

  it.each([
    ["account age", { ageDays: 6 }],
    [
      "active days",
      { engagement: { active_days: 6, sessions: 10, has_activity: true } },
    ],
    [
      "sessions",
      { engagement: { active_days: 7, sessions: 9, has_activity: true } },
    ],
    [
      "activity",
      { engagement: { active_days: 7, sessions: 10, has_activity: false } },
    ],
  ])("LOYAL_USER loses with not_loyal below the %s threshold and does not run the update", async (name, override) => {
    const { ageDays, ...scenario } = override as {
      ageDays?: number;
    } & Scenario;
    const { ctx, queries } = setup(
      `not-loyal-${name}`,
      scenario,
      ageDays ?? 30
    );

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "LOYAL_USER" },
      { context: ctx }
    );

    expect(result).toEqual({ won: false, reason: "not_loyal" });
    expect(ranUpdate(queries)).toBe(false);
  });

  it("does not run the engagement query when the cap already blocks", async () => {
    const { ctx, queries } = setup("capped-loyal", {
      promptedAt: new Date(Date.now() - 5 * DAY_MS),
    });

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "LOYAL_USER" },
      { context: ctx }
    );

    expect(result).toEqual({ won: false, reason: "cooldown" });
    expect(ranEngagement(queries)).toBe(false);
  });

  it("returns disabled and runs no SQL when REVIEW_PROMPTS_ENABLED is false", async () => {
    process.env.REVIEW_PROMPTS_ENABLED = "false";
    const { ctx, queries } = setup("kill-switch");

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "PRIZE_CLAIMED" },
      { context: ctx }
    );

    expect(result).toEqual({ won: false, reason: "disabled" });
    expect(queries).toHaveLength(0);
  });

  it.each([
    "FALSE",
    "False",
    " false ",
    "0",
    "off",
    "no",
  ])("treats REVIEW_PROMPTS_ENABLED=%j as off", async (value) => {
    process.env.REVIEW_PROMPTS_ENABLED = value;
    const { ctx, queries } = setup(`kill-${value.trim()}`);

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "PRIZE_CLAIMED" },
      { context: ctx }
    );

    expect(result).toEqual({ won: false, reason: "disabled" });
    expect(queries).toHaveLength(0);
  });

  it.each([
    "true",
    "1",
    "",
  ])("leaves prompts on for REVIEW_PROMPTS_ENABLED=%j", async (value) => {
    process.env.REVIEW_PROMPTS_ENABLED = value;
    const { ctx } = setup(`on-${value || "empty"}`);

    const result = await call(
      reviewRouter.recordPrompt,
      { trigger: "PRIZE_CLAIMED" },
      { context: ctx }
    );

    expect(result).toEqual({ won: true });
  });

  it("has a named rate-limit bucket of its own", () => {
    // Without a name every limiter shares one counter per user in production
    // (Redis), so claims and comments would throttle review prompts and back.
    expect(REVIEW_RATE_LIMIT.name).toBe("review");
    expect(REVIEW_RATE_LIMIT.maxRequests).toBe(10);
  });

  it("rejects a guest", async () => {
    const payload = createFakePayload({});
    stubDrizzle(payload);
    const ctx = mockContext({
      user: { id: "guest-1", isAnonymous: true } as never,
      payload,
    });

    const error = await expectError(
      call(
        reviewRouter.recordPrompt,
        { trigger: "PRIZE_CLAIMED" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("FORBIDDEN");
  });

  it("rejects an unknown trigger", async () => {
    const { ctx } = setup("bad-trigger");

    const error = await expectError(
      call(reviewRouter.recordPrompt, { trigger: "SOMETHING_ELSE" } as never, {
        context: ctx,
      })
    );

    expect(error.code).toBe("BAD_REQUEST");
  });
});
