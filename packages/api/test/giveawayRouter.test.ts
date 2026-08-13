import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import { giveawayRouter } from "../src/router/giveaway";
import { mockContext } from "../src/test-utils";

type Row = Record<string, any>;

const user = { id: "u1", isAnonymous: false, username: "tester" };

const HOUR = 3_600_000;

function openGiveaway(overrides: Row = {}): Row {
  return {
    id: "g1",
    name: "Week 33",
    status: "active",
    startDate: new Date(Date.now() - HOUR).toISOString(),
    endDate: new Date(Date.now() + HOUR).toISOString(),
    ticketPrice: 50,
    minTicketsRequired: 1,
    ...overrides,
  };
}

/**
 * A Payload stand-in plus a points ledger, wired so that the drizzle calls the
 * purchase endpoint makes behave like the real ones: a balance that is the sum
 * of the ledger, and inserts that append to it.
 */
function createContext({
  giveaway = openGiveaway(),
  tickets = [],
  engagements = [],
  streaks = [],
  content = null,
  points = 10_000,
  onCreate,
}: {
  giveaway?: Row | null;
  tickets?: Row[];
  engagements?: Row[];
  streaks?: Row[];
  content?: Row | null;
  points?: number;
  onCreate?: (collection: string) => void;
} = {}) {
  const ledger: number[] = points ? [points] : [];
  const created: Record<string, Row[]> = {};

  const collections: Record<string, Row[]> = {
    giveaways: giveaway ? [giveaway] : [],
    "giveaway-tickets": tickets,
    "giveaway-engagements": engagements,
    "giveaway-streaks": streaks,
  };

  const balance = () => ledger.reduce((sum, n) => sum + n, 0);

  const tx = {
    execute: async () => undefined,
    select: () => ({
      from: () => ({
        where: async () => [{ totalPoints: balance() }],
      }),
    }),
    insert: () => ({
      values: async (row: Row) => {
        ledger.push(row.point);
      },
    }),
  };

  const drizzle = {
    transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    insert: () => ({
      values: (row: Row) => {
        ledger.push(row.point);
        return { catch: async () => undefined };
      },
    }),
  };

  const payload: Row = {
    logger: { error: () => undefined },
    db: { drizzle },
    find: async ({ collection, where }: Row) => {
      const docs = (collections[collection] ?? []).filter((row) =>
        matchesWhere(row, where)
      );
      return { docs, totalDocs: docs.length };
    },
    findByID: async ({ collection, id }: Row) => {
      if (collection === "partner-content") {
        return content && content.id === id ? content : null;
      }
      return collections[collection]?.find((row) => row.id === id) ?? null;
    },
    create: async ({ collection, data }: Row) => {
      onCreate?.(collection);
      const row = {
        id: `${collection}-${(created[collection]?.length ?? 0) + 1}`,
        ...data,
      };
      created[collection] = [...(created[collection] ?? []), row];
      collections[collection] = [...(collections[collection] ?? []), row];
      return row;
    },
  };

  return {
    ctx: mockContext({ user: user as never, payload }),
    created,
    ledger,
    balance,
  };
}

function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) {
    return true;
  }
  if (Array.isArray(where.and)) {
    return where.and.every((clause: Row) => matchesWhere(row, clause));
  }
  return Object.entries(where).every(([field, condition]) => {
    const clause = condition as Row;
    const actual = row[field];
    const key =
      actual && typeof actual === "object" && "id" in actual
        ? actual.id
        : actual;
    if (clause?.equals !== undefined) {
      return String(key) === String(clause.equals);
    }
    return true;
  });
}

function ticket(overrides: Row = {}): Row {
  return {
    id: "t1",
    giveaway: "g1",
    user: "u1",
    quantity: 1,
    status: "valid",
    ...overrides,
  };
}

function boostItem(overrides: Row = {}): Row {
  return {
    id: "pc1",
    placements: ["connect-brand-video"],
    ...overrides,
  };
}

/** Run a call that should fail and hand the error back to the test. */
async function captureError(
  promise: Promise<unknown>
): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; message: string };
  }
  throw new Error("expected the call to throw, but it resolved");
}

describe("giveaway.current", () => {
  it("returns null when nothing is running", async () => {
    const { ctx } = createContext({ giveaway: null });
    expect(
      await call(giveawayRouter.current, undefined, { context: ctx })
    ).toBe(null);
  });

  it("exposes the ticket price and purchase minimum", async () => {
    const { ctx } = createContext({
      giveaway: openGiveaway({ ticketPrice: 75, minTicketsRequired: 5 }),
    });

    const result = await call(giveawayRouter.current, undefined, {
      context: ctx,
    });

    expect(result).toMatchObject({ ticketPrice: 75, minTicketsRequired: 5 });
  });
});

describe("giveaway.buyTickets (spec §6)", () => {
  it("writes one row per purchase rather than upserting", async () => {
    const { ctx, created } = createContext({
      tickets: [ticket({ id: "t0", quantity: 3 })],
    });

    const result = await call(
      giveawayRouter.buyTickets,
      { quantity: 4 },
      { context: ctx }
    );

    // A second row, not an edit to the first — each purchase is its own
    // weighted entry in the draw.
    expect(created["giveaway-tickets"]).toHaveLength(1);
    expect(created["giveaway-tickets"]?.[0]).toMatchObject({
      quantity: 4,
      status: "valid",
      unitPrice: 50,
    });
    expect(result.validTickets).toBe(7);
  });

  it("charges quantity times price, not quantity", async () => {
    const { ctx, balance } = createContext({ points: 1000 });

    const result = await call(
      giveawayRouter.buyTickets,
      { quantity: 10 },
      { context: ctx }
    );

    expect(result.pointsSpent).toBe(500);
    expect(balance()).toBe(500);
  });

  it("refuses a purchase the user cannot afford", async () => {
    const { ctx, created } = createContext({ points: 100 });

    const error = await captureError(
      call(giveawayRouter.buyTickets, { quantity: 10 }, { context: ctx })
    );

    expect(error.code).toBe("BAD_REQUEST");

    expect(error.message).toMatch(/costs 500 points and you have 100/);
    expect(created["giveaway-tickets"]).toBeUndefined();
  });

  it("enforces the giveaway's minimum purchase", async () => {
    const { ctx } = createContext({
      giveaway: openGiveaway({ minTicketsRequired: 5 }),
    });

    const error = await captureError(
      call(giveawayRouter.buyTickets, { quantity: 2 }, { context: ctx })
    );

    expect(error.code).toBe("BAD_REQUEST");

    expect(error.message).toMatch(/minimum of 5 tickets/);
  });

  it("refunds the points when the ticket cannot be written", async () => {
    const { ctx, balance } = createContext({
      points: 1000,
      onCreate: (collection) => {
        if (collection === "giveaway-tickets") {
          throw new Error("database unavailable");
        }
      },
    });

    await expect(
      call(giveawayRouter.buyTickets, { quantity: 10 }, { context: ctx })
    ).rejects.toThrow(/database unavailable/);

    // Charged 500, refunded 500 — the user is not left out of pocket for
    // tickets they never received.
    expect(balance()).toBe(1000);
  });

  it("refuses to sell once the countdown has ended", async () => {
    const { ctx } = createContext({
      giveaway: openGiveaway({
        endDate: new Date(Date.now() - HOUR).toISOString(),
      }),
    });

    const error = await captureError(
      call(giveawayRouter.buyTickets, { quantity: 1 }, { context: ctx })
    );

    expect(error.code).toBe("CONFLICT");

    expect(error.message).toMatch(/waiting for its draw/);
  });

  it("refuses to sell when no giveaway is running", async () => {
    const { ctx } = createContext({ giveaway: null });

    const error = await captureError(
      call(giveawayRouter.buyTickets, { quantity: 1 }, { context: ctx })
    );

    expect(error.code).toBe("NOT_FOUND");
  });

  it("rejects a negative quantity at the input boundary", async () => {
    const { ctx } = createContext();

    await expect(
      call(giveawayRouter.buyTickets, { quantity: -10 }, { context: ctx })
    ).rejects.toThrow();
  });
});

describe("giveaway.recordEngagement (spec §7, §8)", () => {
  it("records a completed boost", async () => {
    const { ctx, created } = createContext({
      tickets: [ticket()],
      content: boostItem(),
    });

    const result = await call(
      giveawayRouter.recordEngagement,
      { type: "boost", contentId: "pc1" },
      { context: ctx }
    );

    expect(created["giveaway-engagements"]?.[0]).toMatchObject({
      type: "boost",
      completionStatus: "completed",
      content: "pc1",
    });
    expect(result.boosts).toBe(1);
  });

  it("refuses a boost from a user with no ticket", async () => {
    const { ctx, created } = createContext({
      tickets: [],
      content: boostItem(),
    });

    const error = await captureError(
      call(
        giveawayRouter.recordEngagement,
        { type: "boost", contentId: "pc1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("FORBIDDEN");

    expect(error.message).toMatch(/Buy a ticket before/);
    expect(created["giveaway-engagements"]).toBeUndefined();
  });

  it("refuses to count a Lucky App Wall item as a boost", async () => {
    const { ctx } = createContext({
      tickets: [ticket()],
      content: boostItem({ placements: ["lucky-app-wall"] }),
    });

    const error = await captureError(
      call(
        giveawayRouter.recordEngagement,
        { type: "boost", contentId: "pc1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");

    expect(error.message).toMatch(/does not count towards Boost Your Luck/);
  });

  it("accepts the same item as a Featured Offer", async () => {
    const { ctx, created } = createContext({
      tickets: [ticket()],
      content: boostItem({ placements: ["lucky-app-wall"] }),
    });

    await call(
      giveawayRouter.recordEngagement,
      { type: "featured_offer", contentId: "pc1" },
      { context: ctx }
    );

    expect(created["giveaway-engagements"]?.[0]).toMatchObject({
      type: "featured_offer",
    });
  });

  it("counts one partner item once, however many times it is replayed", async () => {
    const { ctx, created } = createContext({
      tickets: [ticket()],
      content: boostItem(),
    });

    await call(
      giveawayRouter.recordEngagement,
      { type: "boost", contentId: "pc1" },
      { context: ctx }
    );

    // Re-watching the same advertisement is not a second boost — otherwise
    // Tier 1's three-boost requirement falls to a single item.
    const error = await captureError(
      call(
        giveawayRouter.recordEngagement,
        { type: "boost", contentId: "pc1" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("CONFLICT");

    expect(error.message).toMatch(/already completed/);
    expect(created["giveaway-engagements"]).toHaveLength(1);
  });

  it("refuses an item that does not exist", async () => {
    const { ctx } = createContext({ tickets: [ticket()], content: null });

    const error = await captureError(
      call(
        giveawayRouter.recordEngagement,
        { type: "boost", contentId: "nope" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("NOT_FOUND");
  });
});

describe("giveaway.progress (spec §11)", () => {
  it("aggregates tickets by quantity, not by row", async () => {
    const { ctx } = createContext({
      tickets: [
        ticket({ id: "t1", quantity: 5 }),
        ticket({ id: "t2", quantity: 5 }),
        // Refunded tickets never count (§6).
        ticket({ id: "t3", quantity: 50, status: "refunded" }),
      ],
    });

    const result = await call(giveawayRouter.progress, undefined, {
      context: ctx,
    });

    expect(result.participation.validTickets).toBe(10);
  });

  it("reports Tier 1 eligibility once every requirement is met", async () => {
    const { ctx } = createContext({
      tickets: [ticket({ quantity: 10 })],
      engagements: [
        {
          id: "e1",
          giveaway: "g1",
          user: "u1",
          type: "boost",
          completionStatus: "completed",
        },
        {
          id: "e2",
          giveaway: "g1",
          user: "u1",
          type: "boost",
          completionStatus: "completed",
        },
        {
          id: "e3",
          giveaway: "g1",
          user: "u1",
          type: "boost",
          completionStatus: "completed",
        },
        {
          id: "e4",
          giveaway: "g1",
          user: "u1",
          type: "featured_offer",
          completionStatus: "completed",
        },
      ],
    });

    const result = await call(giveawayRouter.progress, undefined, {
      context: ctx,
    });

    const tier1 = result.tiers.find((t) => t.tier === "tier1");
    expect(result.participation).toMatchObject({
      validTickets: 10,
      boosts: 3,
      featuredOffers: 1,
    });
    expect(tier1).toMatchObject({ eligible: true, path: "primary" });
  });

  it("reports Tier 1 as out of reach when a boost is missing", async () => {
    const { ctx } = createContext({
      tickets: [ticket({ quantity: 10 })],
      engagements: [
        {
          id: "e1",
          giveaway: "g1",
          user: "u1",
          type: "boost",
          completionStatus: "completed",
        },
        {
          id: "e2",
          giveaway: "g1",
          user: "u1",
          type: "featured_offer",
          completionStatus: "completed",
        },
      ],
    });

    const result = await call(giveawayRouter.progress, undefined, {
      context: ctx,
    });

    expect(result.tiers.find((t) => t.tier === "tier1")?.eligible).toBe(false);
    // One ticket is all Tier 3 asks for.
    expect(result.tiers.find((t) => t.tier === "tier3")?.eligible).toBe(true);
  });
});
