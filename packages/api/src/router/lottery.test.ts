import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import {
  createFakePayload,
  type Doc,
  expectError,
  mockContext,
} from "../test-utils";
import { lotteryRouter } from "./lottery";

const authedUser = { id: "user-1", isAnonymous: false, username: "tester" };
const guestUser = { id: "guest-1", isAnonymous: true, username: "guest" };

function lottery(overrides: Doc = {}): Doc {
  return {
    id: "lottery-1",
    name: "Test Giveaway",
    isActive: true,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ticketPrice: 3,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function winner(overrides: Doc = {}): Doc {
  return {
    id: "winner-1",
    user: "user-1",
    prizeTier: "LOW",
    prize: "100",
    claimed: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── lottery.all ───

describe("lottery.all", () => {
  it("returns all lotteries sorted by -createdAt", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [
          lottery({
            id: "l1",
            name: "Old",
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
          lottery({
            id: "l2",
            name: "New",
            createdAt: "2026-01-03T00:00:00.000Z",
          }),
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(lotteryRouter.all, undefined, { context: ctx });

    expect(result.docs).toHaveLength(2);
    expect(result.docs[0]?.name).toBe("New");
    expect(result.docs[1]?.name).toBe("Old");
  });

  it("returns empty docs when no lotteries exist", async () => {
    const payload = createFakePayload();
    const ctx = mockContext({ payload });

    const result = await call(lotteryRouter.all, undefined, { context: ctx });

    expect(result.docs).toHaveLength(0);
  });
});

// ─── lottery.one ───

describe("lottery.one", () => {
  it("returns a lottery by id", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [lottery({ id: 42 })],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(lotteryRouter.one, 42, { context: ctx });

    expect(result).toMatchObject({ id: 42 });
  });

  it("returns null for a missing lottery id", async () => {
    const payload = createFakePayload({ collections: { lottery: [] } });
    const ctx = mockContext({ payload });

    const result = await call(lotteryRouter.one, 999, { context: ctx });

    expect(result).toBeNull();
  });
});

// ─── lottery.current ───

describe("lottery.current", () => {
  it("returns the first active lottery", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [
          lottery({ id: "l1", isActive: true }),
          lottery({ id: "l2", isActive: false }),
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(lotteryRouter.current, undefined, {
      context: ctx,
    });

    expect(result).toMatchObject({ id: "l1", isActive: true });
  });

  it("returns null when no active lottery exists", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [lottery({ isActive: false })],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(lotteryRouter.current, undefined, {
      context: ctx,
    });

    expect(result).toBeNull();
  });
});

// ─── lottery.getReward ───

describe("lottery.getReward", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(lotteryRouter.getReward, undefined, { context: mockContext() })
    );
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("allows a guest caller (requireAuth only checks session+user)", async () => {
    const payload = createFakePayload({
      collections: { "lottery-winners": [] },
    });
    const ctx = mockContext({ user: guestUser as never, payload });

    const result = await call(lotteryRouter.getReward, undefined, {
      context: ctx,
    });

    expect(result).toBeNull();
  });

  it("returns the first unclaimed winner for the user", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-winners": [
          winner({ id: "w1", user: "user-1", claimed: false }),
        ],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(lotteryRouter.getReward, undefined, {
      context: ctx,
    });

    expect(result).toMatchObject({ id: "w1", claimed: false });
  });

  it("returns null when no unclaimed winners exist", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-winners": [
          winner({ id: "w1", user: "user-1", claimed: true }),
        ],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(lotteryRouter.getReward, undefined, {
      context: ctx,
    });

    expect(result).toBeNull();
  });
});

// ─── lottery.claimReward ───

describe("lottery.claimReward", () => {
  function drizzleStub(returningRows: Doc[]) {
    return {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => returningRows,
          }),
        }),
      }),
    };
  }

  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(
        lotteryRouter.claimReward,
        { winnerId: "w1" },
        {
          context: mockContext(),
        }
      )
    );
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("throws when winner does not exist (crashes on null access)", async () => {
    const payload = createFakePayload({
      collections: { "lottery-winners": [] },
    });
    payload.db.drizzle = drizzleStub([]);
    const ctx = mockContext({ user: authedUser as never, payload });

    // The handler accesses winner.user before the null check, so it crashes
    await expectError(
      call(
        lotteryRouter.claimReward,
        { winnerId: "w-missing" },
        {
          context: ctx,
        }
      )
    );
  });

  it("throws NOT_FOUND when winner belongs to another user", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-winners": [winner({ id: "w-other", user: "user-other" })],
      },
    });
    payload.db.drizzle = drizzleStub([]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        lotteryRouter.claimReward,
        { winnerId: "w-other" },
        {
          context: ctx,
        }
      )
    );

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "Winner not found",
    });
  });

  it("throws NOT_FOUND when winner.user is an object with different id", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-winners": [
          winner({ id: "w-obj", user: { id: "user-other" } }),
        ],
      },
    });
    payload.db.drizzle = drizzleStub([]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        lotteryRouter.claimReward,
        { winnerId: "w-obj" },
        {
          context: ctx,
        }
      )
    );

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "Winner not found",
    });
  });

  it("throws CONFLICT when reward is already claimed (returning empty)", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-winners": [winner({ id: "w1", user: "user-1" })],
      },
    });
    payload.db.drizzle = drizzleStub([]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        lotteryRouter.claimReward,
        { winnerId: "w1" },
        {
          context: ctx,
        }
      )
    );

    expect(error).toMatchObject({
      code: "CONFLICT",
      message: "Reward already claimed",
    });
  });

  it("returns updated row on success for LOW tier with activity created", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-winners": [
          winner({ id: "w1", user: "user-1", prizeTier: "LOW", prize: "50" }),
        ],
      },
    });
    const drizzleReturn = [
      { id: "w1", claimed: true, claimedAt: "2026-01-02T00:00:00.000Z" },
    ];
    payload.db.drizzle = drizzleStub(drizzleReturn);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      lotteryRouter.claimReward,
      { winnerId: "w1" },
      { context: ctx }
    );

    expect(result).toMatchObject({ id: "w1", claimed: true });
    // LOW tier with numeric prize → addActivity called → creates activity
    expect(payload.docs("activities")).toHaveLength(1);
    expect(payload.docs("activities")[0]).toMatchObject({
      type: "point",
      point: 50,
      action: "lottery",
      description: "Giveaway reward claimed",
      user: "user-1",
    });
  });

  it("does not create activity for non-LOW prizeTier", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-winners": [
          winner({
            id: "w2",
            user: "user-1",
            prizeTier: "HIGH",
            prize: "500",
          }),
        ],
      },
    });
    const drizzleReturn = [
      { id: "w2", claimed: true, claimedAt: "2026-01-02T00:00:00.000Z" },
    ];
    payload.db.drizzle = drizzleStub(drizzleReturn);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      lotteryRouter.claimReward,
      { winnerId: "w2" },
      { context: ctx }
    );

    expect(result).toMatchObject({ id: "w2", claimed: true });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("does not create activity for LOW tier with non-numeric prize", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-winners": [
          winner({
            id: "w3",
            user: "user-1",
            prizeTier: "LOW",
            prize: "abc",
          }),
        ],
      },
    });
    const drizzleReturn = [
      { id: "w3", claimed: true, claimedAt: "2026-01-02T00:00:00.000Z" },
    ];
    payload.db.drizzle = drizzleStub(drizzleReturn);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      lotteryRouter.claimReward,
      { winnerId: "w3" },
      { context: ctx }
    );

    expect(result).toMatchObject({ id: "w3", claimed: true });
    expect(payload.docs("activities")).toHaveLength(0);
  });
});

// ─── lottery.verifyIdentity ───

describe("lottery.verifyIdentity", () => {
  const validFiles = {
    "governmentId.front": new File(["front-data"], "front.jpg", {
      type: "image/jpeg",
    }),
    "governmentId.back": new File(["back-data"], "back.jpg", {
      type: "image/jpeg",
    }),
  };

  const validInput = {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    phoneNumber: "1234567890",
    shippingAddress: "123 Main St",
    ...validFiles,
  };

  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(lotteryRouter.verifyIdentity, validInput, {
        context: mockContext(),
      })
    );
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a guest caller", async () => {
    const ctx = mockContext({ user: guestUser as never });
    const error = await expectError(
      call(lotteryRouter.verifyIdentity, validInput, { context: ctx })
    );
    expect(error.code).toBe("FORBIDDEN");
  });

  it("returns existing verification without creating new docs", async () => {
    const existing = {
      id: "iv-1",
      user: "user-1",
      status: "pending",
    };
    const payload = createFakePayload({
      collections: {
        "identity-verification": [existing],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(lotteryRouter.verifyIdentity, validInput, {
      context: ctx,
    });

    expect(result).toMatchObject({ id: "iv-1" });
    // No new docs should be created (media or verification)
    expect(payload.docs("media")).toHaveLength(0);
    expect(payload.docs("identity-verification")).toHaveLength(1);
  });

  it("creates media and verification on success", async () => {
    const payload = createFakePayload({
      collections: {
        "identity-verification": [],
        media: [],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(lotteryRouter.verifyIdentity, validInput, {
      context: ctx,
    });

    expect(result).toMatchObject({ user: "user-1" });
    expect(payload.docs("media")).toHaveLength(2);
    expect(payload.docs("identity-verification")).toHaveLength(1);
    expect(payload.docs("identity-verification")[0]).toMatchObject({
      user: "user-1",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      phoneNumber: "1234567890",
      shippingAddress: "123 Main St",
    });
    // Transaction should have been committed
    expect(payload.transactions).toContain("commit:tx-1");
  });

  it("rolls back and deletes uploaded media on failure", async () => {
    const payload = createFakePayload({
      collections: {
        "identity-verification": [],
        media: [],
      },
    });
    // Make the third create (identity-verification) throw
    let callCount = 0;
    const originalCreate = payload.create;
    payload.create = async (args: Doc) => {
      callCount++;
      if (callCount === 3) {
        throw new Error("DB write failed");
      }
      return await originalCreate(args);
    };
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(lotteryRouter.verifyIdentity, validInput, { context: ctx })
    );

    expect(error.message).toContain("DB write failed");
    // Transaction should have been rolled back
    expect(payload.transactions).toContain("rollback:tx-1");
    // Media should have been deleted
    expect(payload.docs("media")).toHaveLength(0);
    // No verification should exist
    expect(payload.docs("identity-verification")).toHaveLength(0);
  });

  it("rejects invalid phone number (non-digits)", async () => {
    const payload = createFakePayload({
      collections: { "identity-verification": [] },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        lotteryRouter.verifyIdentity,
        { ...validInput, phoneNumber: "abc-123" },
        { context: ctx }
      )
    );

    expect(error).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects firstName shorter than 3 characters", async () => {
    const payload = createFakePayload({
      collections: { "identity-verification": [] },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        lotteryRouter.verifyIdentity,
        { ...validInput, firstName: "Jo" },
        { context: ctx }
      )
    );

    expect(error).toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── lottery.identityStatus ───

describe("lottery.identityStatus", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(lotteryRouter.identityStatus, undefined, { context: mockContext() })
    );
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a guest caller", async () => {
    const ctx = mockContext({ user: guestUser as never });
    const error = await expectError(
      call(lotteryRouter.identityStatus, undefined, { context: ctx })
    );
    expect(error.code).toBe("FORBIDDEN");
  });

  it("returns the user's verification record", async () => {
    const payload = createFakePayload({
      collections: {
        "identity-verification": [
          { id: "iv-1", user: "user-1", status: "pending" },
        ],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(lotteryRouter.identityStatus, undefined, {
      context: ctx,
    });

    expect(result).toMatchObject({ id: "iv-1", status: "pending" });
  });

  it("returns null when no verification exists", async () => {
    const payload = createFakePayload({
      collections: { "identity-verification": [] },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(lotteryRouter.identityStatus, undefined, {
      context: ctx,
    });

    expect(result).toBeNull();
  });
});
