import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import {
  createFakePayload,
  type Doc,
  expectError,
  mockContext,
} from "../test-utils";
import { lotteryTicketRouter } from "./lotteryTicket";

const authedUser = { id: "user-1", isAnonymous: false, username: "tester" };
const guestUser = { id: "guest-1", isAnonymous: true, username: "guest" };

function activeLottery(overrides: Doc = {}): Doc {
  return {
    id: "lottery-1",
    name: "Test Giveaway",
    isActive: true,
    ticketPrice: 5,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── drizzle stub helpers ───

function createDrizzleTxStub(opts: { balanceRows?: Doc[]; throwOnTx?: Error }) {
  const txMethods = {
    execute: async () => undefined,
    select: () => ({
      from: () => ({
        where: async () => opts.balanceRows ?? [{ totalPoints: 100 }],
      }),
    }),
    insert: () => ({
      values: async () => undefined,
    }),
  };

  return {
    transaction: async (fn: (tx: typeof txMethods) => Promise<void>) => {
      if (opts.throwOnTx) {
        throw opts.throwOnTx;
      }
      await fn(txMethods);
    },
    // Direct insert for refund path in create's catch block
    insert: () => ({
      values: async () => undefined,
      catch: async () => undefined,
    }),
  };
}

function drizzleSelectStub(rows: Doc[]) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

function drizzleSelectWithLimitStub(rows: Doc[]) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => rows,
          }),
        }),
      }),
    }),
  };
}

function drizzleSelectTripleJoinStub(rows: Doc[]) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => rows,
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

function drizzleUpdateStub(returningRows: Doc[]) {
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

// ─── lotteryTicket.create ───

describe("lotteryTicket.create", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(
        lotteryTicketRouter.create,
        { num_of_tickets: 1 },
        {
          context: mockContext(),
        }
      )
    );
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a guest caller", async () => {
    const ctx = mockContext({ user: guestUser as never });
    const error = await expectError(
      call(
        lotteryTicketRouter.create,
        { num_of_tickets: 1 },
        {
          context: ctx,
        }
      )
    );
    expect(error.code).toBe("FORBIDDEN");
  });

  it("throws NOT_FOUND when no active lottery exists", async () => {
    const payload = createFakePayload({
      collections: { lottery: [] },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        lotteryTicketRouter.create,
        { num_of_tickets: 1 },
        {
          context: ctx,
        }
      )
    );

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "No active giveaway",
    });
  });

  it("throws BAD_REQUEST when user has insufficient points", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [activeLottery({ ticketPrice: 10 })],
      },
    });
    // User has 0 points (no activities)
    payload.db.drizzle = createDrizzleTxStub({
      balanceRows: [{ totalPoints: 5 }],
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        lotteryTicketRouter.create,
        { num_of_tickets: 3 },
        {
          context: ctx,
        }
      )
    );

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(error.message).toContain("Not enough points");
    expect(error.message).toContain("3 tickets costs 30 points");
    expect(error.message).toContain("you have 5");
  });

  it("throws BAD_REQUEST for single ticket with insufficient points", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [activeLottery({ ticketPrice: 50 })],
      },
    });
    payload.db.drizzle = createDrizzleTxStub({
      balanceRows: [{ totalPoints: 10 }],
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        lotteryTicketRouter.create,
        { num_of_tickets: 1 },
        {
          context: ctx,
        }
      )
    );

    expect(error).toMatchObject({ code: "BAD_REQUEST" });
    expect(error.message).toContain("1 ticket costs 50");
  });

  it("creates a new ticket when user has no existing ticket for this lottery", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [activeLottery({ id: "lottery-1" })],
        "lottery-tickets": [],
        "ticket-purchase-log": [],
        activities: [],
      },
    });
    payload.db.drizzle = createDrizzleTxStub({
      balanceRows: [{ totalPoints: 100 }],
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      lotteryTicketRouter.create,
      { num_of_tickets: 2 },
      { context: ctx }
    );

    expect(result).toMatchObject({
      count: 2,
      user: "user-1",
      lottery: "lottery-1",
      boostLuck: 0,
    });
    expect(payload.docs("lottery-tickets")).toHaveLength(1);
    expect(payload.docs("ticket-purchase-log")).toHaveLength(1);
    expect(payload.docs("ticket-purchase-log")[0]).toMatchObject({
      user: "user-1",
      ticketQuantity: 2,
    });
  });

  it("updates existing ticket count (upsert path)", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [activeLottery({ id: "lottery-1" })],
        "lottery-tickets": [
          {
            id: "lt-1",
            user: "user-1",
            lottery: "lottery-1",
            count: 3,
            boostLuck: 0,
          },
        ],
        "ticket-purchase-log": [],
        activities: [],
      },
    });
    payload.db.drizzle = createDrizzleTxStub({
      balanceRows: [{ totalPoints: 100 }],
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      lotteryTicketRouter.create,
      { num_of_tickets: 2 },
      { context: ctx }
    );

    // Should have called update, so count should be 3 + 2 = 5
    expect(result).toMatchObject({ count: 5 });
    expect(payload.docs("lottery-tickets")).toHaveLength(1);
    expect(payload.docs("lottery-tickets")[0]?.count).toBe(5);
  });
});

// ─── lotteryTicket.getByUser ───

describe("lotteryTicket.getByUser", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(lotteryTicketRouter.getByUser, undefined, {
        context: mockContext(),
      })
    );
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("allows a guest caller (requireAuth only checks session+user)", async () => {
    const payload = createFakePayload();
    payload.db.drizzle = drizzleSelectWithLimitStub([]);
    const ctx = mockContext({ user: guestUser as never, payload });

    const result = await call(lotteryTicketRouter.getByUser, undefined, {
      context: ctx,
    });

    expect(result).toBeNull();
  });

  it("returns the user's active lottery ticket", async () => {
    const row = {
      lottery_tickets: { id: "lt-1", user: "user-1", count: 5 },
      lottery: { id: "lottery-1", isActive: true },
    };
    const payload = createFakePayload();
    payload.db.drizzle = drizzleSelectWithLimitStub([row]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(lotteryTicketRouter.getByUser, undefined, {
      context: ctx,
    });

    expect(result).toMatchObject(row);
  });

  it("returns null when user has no active ticket", async () => {
    const payload = createFakePayload();
    payload.db.drizzle = drizzleSelectWithLimitStub([]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(lotteryTicketRouter.getByUser, undefined, {
      context: ctx,
    });

    expect(result).toBeNull();
  });
});

// ─── lotteryTicket.get ───

describe("lotteryTicket.get", () => {
  it("returns all active lottery tickets", async () => {
    const rows = [
      {
        lottery_tickets: { id: "lt-1", user: "user-1", count: 3 },
        lottery: { id: "lottery-1", isActive: true },
      },
      {
        lottery_tickets: { id: "lt-2", user: "user-2", count: 1 },
        lottery: { id: "lottery-1", isActive: true },
      },
    ];
    const payload = createFakePayload();
    payload.db.drizzle = drizzleSelectStub(rows);
    const ctx = mockContext({ payload });

    const result = await call(lotteryTicketRouter.get, undefined, {
      context: ctx,
    });

    expect(result).toHaveLength(2);
  });

  it("returns empty array when no active tickets exist", async () => {
    const payload = createFakePayload();
    payload.db.drizzle = drizzleSelectStub([]);
    const ctx = mockContext({ payload });

    const result = await call(lotteryTicketRouter.get, undefined, {
      context: ctx,
    });

    expect(result).toHaveLength(0);
  });
});

// ─── lotteryTicket.purchaseLog ───

describe("lotteryTicket.purchaseLog", () => {
  it("returns recent purchases with triple-joined data", async () => {
    const rows = [
      {
        lottery_tickets: {
          id: "lt-1",
          ticketQuantity: 5,
          createdAt: "2026-01-02",
        },
        lottery: { id: "lottery-1", name: "Test Giveaway" },
        users: { id: "user-1", username: "tester" },
      },
    ];
    const payload = createFakePayload();
    payload.db.drizzle = drizzleSelectTripleJoinStub(rows);
    const ctx = mockContext({ payload });

    const result = await call(lotteryTicketRouter.purchaseLog, undefined, {
      context: ctx,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(rows[0] ?? {});
  });

  it("returns empty array when no purchase logs exist", async () => {
    const payload = createFakePayload();
    payload.db.drizzle = drizzleSelectTripleJoinStub([]);
    const ctx = mockContext({ payload });

    const result = await call(lotteryTicketRouter.purchaseLog, undefined, {
      context: ctx,
    });

    expect(result).toHaveLength(0);
  });
});

// ─── lotteryTicket.boostLuck ───

describe("lotteryTicket.boostLuck", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(lotteryTicketRouter.boostLuck, undefined, {
        context: mockContext(),
      })
    );
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a guest caller", async () => {
    const ctx = mockContext({ user: guestUser as never });
    const error = await expectError(
      call(lotteryTicketRouter.boostLuck, undefined, { context: ctx })
    );
    expect(error.code).toBe("FORBIDDEN");
  });

  it("increments boostLuck and returns updated ticket", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [activeLottery({ id: "lottery-1" })],
      },
    });
    const updatedRow = {
      id: "lt-1",
      user: "user-1",
      lottery: "lottery-1",
      boostLuck: 1,
    };
    payload.db.drizzle = drizzleUpdateStub([updatedRow]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(lotteryTicketRouter.boostLuck, undefined, {
      context: ctx,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ boostLuck: 1 });
  });

  it("throws NOT_FOUND when user has no ticket for the active lottery", async () => {
    const payload = createFakePayload({
      collections: {
        lottery: [activeLottery({ id: "lottery-1" })],
      },
    });
    payload.db.drizzle = drizzleUpdateStub([]);
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(lotteryTicketRouter.boostLuck, undefined, { context: ctx })
    );

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "No giveaway ticket found",
    });
  });
});
