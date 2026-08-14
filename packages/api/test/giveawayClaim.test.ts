import { describe, expect, it } from "bun:test";
import {
  claimDeadlineFor,
  claimWindowFor,
  expireLapsedClaims,
} from "@news-spend-media/payload/lib/giveaway/claim";
import { call } from "@orpc/server";

import { giveawayRouter } from "../src/router/giveaway";
import { mockContext } from "../src/test-utils";

type Row = Record<string, any>;

const DAY = 24 * 60 * 60 * 1000;
const user = { id: "u1", isAnonymous: false, username: "tester" };

function pastGiveaway(overrides: Row = {}): Row {
  return {
    id: "g1",
    name: "Week 33",
    status: "completed",
    startDate: new Date(Date.now() - 20 * DAY).toISOString(),
    endDate: new Date(Date.now() - 6 * DAY).toISOString(),
    ...overrides,
  };
}

function prize(overrides: Row = {}): Row {
  return {
    id: "cat-1",
    name: "500 Airtime",
    fulfilmentType: "airtime",
    ...overrides,
  };
}

function winnerRow(overrides: Row = {}): Row {
  const selectedAt = new Date(Date.now() - 2 * DAY).toISOString();
  return {
    id: "w1",
    giveaway: pastGiveaway(),
    user: "u1",
    tier: "tier3",
    prize: prize(),
    prizeName: "500 Airtime",
    selectedAt,
    claimDeadline: claimDeadlineFor(selectedAt),
    claimStatus: "unclaimed",
    fulfilmentStatus: "pending",
    ...overrides,
  };
}

function createContext({
  winners = [],
  giveaways = [pastGiveaway()],
}: {
  winners?: Row[];
  giveaways?: Row[];
} = {}) {
  const collections: Record<string, Row[]> = {
    "giveaway-winners": winners,
    giveaways,
  };
  const points: number[] = [];

  const payload: any = {
    logger: { error: () => undefined, warn: () => undefined },
    db: {
      drizzle: {
        insert: () => ({
          values: async (row: Row) => {
            points.push(row.point);
          },
        }),
      },
    },
    findByID: async ({ collection, id }: Row) =>
      collections[collection]?.find((row) => row.id === id) ?? null,
    find: async ({ collection, where }: Row) => {
      const docs = (collections[collection] ?? []).filter((row) =>
        matchesWhere(row, where)
      );
      return { docs, totalDocs: docs.length };
    },
    update: async ({ collection, id, data }: Row) => {
      const row = collections[collection]?.find((item) => item.id === id);
      if (row) {
        Object.assign(row, data);
      }
      return row ?? { id, ...data };
    },
  };

  return {
    ctx: mockContext({ user: user as never, payload }),
    payload,
    collections,
    points,
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
    if (clause?.not_equals !== undefined) {
      return String(key) !== String(clause.not_equals);
    }
    if (clause?.greater_than !== undefined) {
      return String(key) > String(clause.greater_than);
    }
    return true;
  });
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; message: string };
  }
  throw new Error("expected the call to throw, but it resolved");
}

describe("claimWindowFor (spec §21)", () => {
  const selectedAt = new Date(Date.now() - 2 * DAY).toISOString();
  const winner = { selectedAt, claimDeadline: claimDeadlineFor(selectedAt) };

  it("is open inside the 14 days", () => {
    expect(claimWindowFor(winner, { laterGiveawayExists: false }).open).toBe(
      true
    );
  });

  it("closes once 14 days have passed", () => {
    const window = claimWindowFor(winner, {
      laterGiveawayExists: false,
      now: new Date(Date.now() + 13 * DAY),
    });

    expect(window.open).toBe(false);
    if (!window.open) {
      expect(window.reason).toBe("expired");
    }
  });

  it("closes the moment a later giveaway exists, deadline or not", () => {
    // Two days in, twelve still on the clock — but a new round has started.
    const window = claimWindowFor(winner, { laterGiveawayExists: true });

    expect(window.open).toBe(false);
    if (!window.open) {
      expect(window.reason).toBe("superseded");
      expect(window.message).toMatch(/new giveaway has already started/);
    }
  });
});

describe("giveaway.winnings", () => {
  it("lists prizes with what each one still needs", async () => {
    const { ctx } = createContext({
      winners: [
        winnerRow({ id: "w1", prize: prize({ fulfilmentType: "airtime" }) }),
        winnerRow({
          id: "w2",
          prize: prize({ id: "cat-2", fulfilmentType: "physical" }),
          prizeName: "Refrigerator",
        }),
        winnerRow({
          id: "w3",
          prize: prize({ id: "cat-3", fulfilmentType: "points" }),
          prizeName: "500 Points",
        }),
      ],
    });

    const rows = await call(giveawayRouter.winnings, undefined, {
      context: ctx,
    });

    expect(rows.find((r) => r.id === "w1")?.needs).toEqual({
      phone: true,
      address: false,
    });
    expect(rows.find((r) => r.id === "w2")?.needs).toEqual({
      phone: false,
      address: true,
    });
    expect(rows.find((r) => r.id === "w3")?.needs).toEqual({
      phone: false,
      address: false,
    });
  });

  it("still shows an expired prize, marked closed", async () => {
    const selectedAt = new Date(Date.now() - 30 * DAY).toISOString();
    const { ctx } = createContext({
      winners: [
        winnerRow({
          selectedAt,
          claimDeadline: claimDeadlineFor(selectedAt),
        }),
      ],
    });

    const [row] = await call(giveawayRouter.winnings, undefined, {
      context: ctx,
    });

    // A winner who missed the deadline should see that they did, rather than
    // find the prize silently gone.
    expect(row?.claimable).toBe(false);
    expect(row?.closedReason).toBe("expired");
  });

  it("flags a prize held for review rather than promising delivery", async () => {
    const { ctx } = createContext({
      winners: [winnerRow({ fulfilmentStatus: "on_hold" })],
    });

    const [row] = await call(giveawayRouter.winnings, undefined, {
      context: ctx,
    });

    expect(row?.underReview).toBe(true);
  });

  it("does not list another user's prize", async () => {
    const { ctx } = createContext({
      winners: [winnerRow({ user: "someone-else" })],
    });

    const rows = await call(giveawayRouter.winnings, undefined, {
      context: ctx,
    });

    expect(rows).toHaveLength(0);
  });
});

describe("giveaway.claimPrize (spec §21)", () => {
  it("credits a points prize immediately", async () => {
    const { ctx, points, collections } = createContext({
      winners: [
        winnerRow({
          prize: prize({ fulfilmentType: "points", pointsAmount: 500 }),
          prizeName: "500 Points",
        }),
      ],
    });

    const result = await call(
      giveawayRouter.claimPrize,
      { winnerId: "w1" },
      { context: ctx }
    );

    expect(result.pointsCredited).toBe(500);
    expect(points).toEqual([500]);
    // Settled outright — there is no window where it reads claimed but unpaid.
    expect(collections["giveaway-winners"]?.[0]?.fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("requires a phone number for airtime", async () => {
    const { ctx } = createContext({ winners: [winnerRow()] });

    const error = await captureError(
      call(giveawayRouter.claimPrize, { winnerId: "w1" }, { context: ctx })
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toMatch(/phone number is needed/);
  });

  it("stores the nominated number and leaves fulfilment pending", async () => {
    const { ctx, collections } = createContext({ winners: [winnerRow()] });

    await call(
      giveawayRouter.claimPrize,
      { winnerId: "w1", phoneNumber: "08031234567" },
      { context: ctx }
    );

    const stored = collections["giveaway-winners"]?.[0];
    expect(stored?.claimPhone).toBe("08031234567");
    expect(stored?.claimStatus).toBe("claimed");
    expect(stored?.fulfilmentStatus).toBe("pending");
  });

  it("requires an address and recipient for a physical prize", async () => {
    const { ctx } = createContext({
      winners: [
        winnerRow({
          prize: prize({ fulfilmentType: "physical" }),
          prizeName: "Refrigerator",
        }),
      ],
    });

    const error = await captureError(
      call(
        giveawayRouter.claimPrize,
        { winnerId: "w1", recipientName: "Ada" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toMatch(/delivery address and recipient name/);
  });

  it("refuses once a later giveaway has started", async () => {
    const { ctx } = createContext({
      winners: [winnerRow()],
      giveaways: [
        pastGiveaway(),
        // A newer round is running, so the old prize is closed even though
        // twelve days of its window remain.
        {
          id: "g2",
          name: "Week 34",
          status: "active",
          startDate: new Date(Date.now() - DAY).toISOString(),
          endDate: new Date(Date.now() + 13 * DAY).toISOString(),
        },
      ],
    });

    const error = await captureError(
      call(
        giveawayRouter.claimPrize,
        { winnerId: "w1", phoneNumber: "08031234567" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("CONFLICT");
    expect(error.message).toMatch(/new giveaway has already started/);
  });

  it("ignores a draft giveaway when deciding supersession", async () => {
    const { ctx } = createContext({
      winners: [winnerRow()],
      giveaways: [
        pastGiveaway(),
        // Configured but not published — it has not started anything.
        {
          id: "g2",
          status: "draft",
          startDate: new Date(Date.now() - DAY).toISOString(),
          endDate: new Date(Date.now() + 13 * DAY).toISOString(),
        },
      ],
    });

    const result = await call(
      giveawayRouter.claimPrize,
      { winnerId: "w1", phoneNumber: "08031234567" },
      { context: ctx }
    );

    expect(result.claimStatus).toBe("claimed");
  });

  it("refuses a second claim", async () => {
    const { ctx } = createContext({
      winners: [winnerRow({ claimStatus: "claimed" })],
    });

    const error = await captureError(
      call(
        giveawayRouter.claimPrize,
        { winnerId: "w1", phoneNumber: "08031234567" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("CONFLICT");
    expect(error.message).toMatch(/already claimed/);
  });

  it("keeps a held prize held after it is claimed", async () => {
    const { ctx, collections } = createContext({
      winners: [winnerRow({ fulfilmentStatus: "on_hold" })],
    });

    const result = await call(
      giveawayRouter.claimPrize,
      { winnerId: "w1", phoneNumber: "08031234567" },
      { context: ctx }
    );

    // §22.8 — claiming is the winner's act, releasing is the administrator's.
    expect(result.underReview).toBe(true);
    expect(collections["giveaway-winners"]?.[0]?.fulfilmentStatus).toBe(
      "on_hold"
    );
  });

  it("will not let one user claim another's prize", async () => {
    const { ctx } = createContext({
      winners: [winnerRow({ user: "someone-else" })],
    });

    const error = await captureError(
      call(
        giveawayRouter.claimPrize,
        { winnerId: "w1", phoneNumber: "08031234567" },
        { context: ctx }
      )
    );

    // Deliberately NOT_FOUND rather than FORBIDDEN — a stranger's prize should
    // not be confirmed to exist.
    expect(error.code).toBe("NOT_FOUND");
  });
});

describe("expireLapsedClaims (spec §21)", () => {
  it("expires an unclaimed prize past its deadline", async () => {
    const selectedAt = new Date(Date.now() - 30 * DAY).toISOString();
    const { payload, collections } = createContext({
      winners: [
        winnerRow({ selectedAt, claimDeadline: claimDeadlineFor(selectedAt) }),
      ],
    });

    const expired = await expireLapsedClaims(payload);

    expect(expired).toBe(1);
    expect(collections["giveaway-winners"]?.[0]).toMatchObject({
      claimStatus: "expired",
      // An expired prize must not stay in anyone's dispatch queue.
      fulfilmentStatus: "cancelled",
    });
  });

  it("expires an unclaimed prize once a later giveaway starts", async () => {
    const { payload, collections } = createContext({
      winners: [winnerRow()],
      giveaways: [
        pastGiveaway(),
        {
          id: "g2",
          status: "active",
          startDate: new Date(Date.now() - DAY).toISOString(),
          endDate: new Date(Date.now() + 13 * DAY).toISOString(),
        },
      ],
    });

    const expired = await expireLapsedClaims(payload);

    expect(expired).toBe(1);
    expect(collections["giveaway-winners"]?.[0]?.claimStatus).toBe("expired");
  });

  it("leaves a prize still inside its window alone", async () => {
    const { payload, collections } = createContext({
      winners: [winnerRow()],
    });

    expect(await expireLapsedClaims(payload)).toBe(0);
    expect(collections["giveaway-winners"]?.[0]?.claimStatus).toBe("unclaimed");
  });

  it("does not touch a prize that was already claimed", async () => {
    const selectedAt = new Date(Date.now() - 30 * DAY).toISOString();
    const { payload, collections } = createContext({
      winners: [
        winnerRow({
          selectedAt,
          claimDeadline: claimDeadlineFor(selectedAt),
          claimStatus: "claimed",
        }),
      ],
    });

    expect(await expireLapsedClaims(payload)).toBe(0);
    expect(collections["giveaway-winners"]?.[0]?.claimStatus).toBe("claimed");
  });
});
