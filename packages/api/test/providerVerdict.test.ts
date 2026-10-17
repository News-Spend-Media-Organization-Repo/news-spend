import { describe, expect, it } from "bun:test";
import {
  applyProviderVerdict,
  latestProviderTransactionId,
  type ProviderVerdict,
} from "@news-spend-media/payload/lib/giveaway/providerVerdict";

import { matchesWhere } from "../src/test-utils";

type Row = Record<string, any>;

function winnerRow(overrides: Row = {}): Row {
  return {
    id: "w1",
    prizeName: "₦500 Airtime",
    fulfilmentStatus: "in_progress",
    ...overrides,
  };
}

function attemptRow(overrides: Row = {}): Row {
  return {
    id: "a1",
    winner: "w1",
    outcome: "retryable_failure",
    attemptedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * A leaner fake than the fulfilment suite's: only the operations applying a
 * verdict uses. `find` filters with the shared {@link matchesWhere}, and the
 * attempt log is a real collection rather than a stub, so the retry cap and the
 * id the row records are exercised rather than asserted against a seeded shape.
 */
function createFakePayload({
  winners = [],
  attempts = [] as Row[],
}: {
  winners?: Row[];
  attempts?: Row[];
} = {}) {
  const collections: Record<string, Row[]> = {
    "giveaway-winners": winners,
    "giveaway-fulfilment-attempts": attempts,
  };

  const payload: any = {
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    find: async ({ collection, where, sort, limit }: Row) => {
      let docs = (collections[collection] ?? []).filter((row) =>
        matchesWhere(row, where)
      );
      if (sort) {
        const descending = String(sort).startsWith("-");
        const field = String(sort).replace(/^-/, "");
        docs = [...docs].sort((a, b) => {
          const result = String(a[field]).localeCompare(String(b[field]));
          return descending ? -result : result;
        });
      }
      if (limit) {
        docs = docs.slice(0, limit);
      }
      return { docs, totalDocs: docs.length };
    },
    findByID: async ({ collection, id }: Row) =>
      collections[collection]?.find((row) => row.id === id) ?? null,
    create: async ({ collection, data }: Row) => {
      const row = {
        id: `${collection}-${(collections[collection]?.length ?? 0) + 1}`,
        ...data,
      };
      collections[collection] = [...(collections[collection] ?? []), row];
      return row;
    },
    count: async ({ collection, where }: Row) => ({
      totalDocs: (collections[collection] ?? []).filter((row) =>
        matchesWhere(row, where)
      ).length,
    }),
    update: async ({ collection, id, data }: Row) => {
      const row = collections[collection]?.find((item) => item.id === id);
      if (row) {
        Object.assign(row, data);
      }
      return row ?? { id, ...data };
    },
    sendEmail: async () => undefined,
  };

  return { payload, collections };
}

function target(overrides: Row = {}) {
  return {
    winnerId: "w1",
    environment: "sandbox" as const,
    phone: "2348000000000",
    currentStatus: "in_progress" as const,
    ...overrides,
  };
}

describe("applyProviderVerdict", () => {
  it("fulfils a prize the provider calls SUCCESSFUL", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });

    const outcome = await applyProviderVerdict(payload, target(), {
      status: "SUCCESSFUL",
      transactionId: "42",
    });

    expect(outcome).toBe("fulfilled");
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
    expect(typeof collections["giveaway-winners"][0].fulfilledAt).toBe(
      "string"
    );
  });

  it("leaves a still-settling PROCESSING prize alone", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });

    const outcome = await applyProviderVerdict(payload, target(), {
      status: "PROCESSING",
      transactionId: "42",
    });

    expect(outcome).toBe("unchanged");
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "in_progress"
    );
    expect(collections["giveaway-fulfilment-attempts"]).toHaveLength(0);
  });

  it("returns a FAILED prize to the queue", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });

    const outcome = await applyProviderVerdict(payload, target(), {
      status: "FAILED",
      transactionId: "42",
    });

    expect(outcome).toBe("requeued");
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
    expect(collections["giveaway-fulfilment-attempts"][0].outcome).toBe(
      "retryable_failure"
    );
  });

  it("treats REFUNDED as unpaid", async () => {
    // The money came back, so the winner is unpaid and the prize is retryable,
    // exactly as for FAILED.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });

    const outcome = await applyProviderVerdict(payload, target(), {
      status: "REFUNDED",
      transactionId: "42",
    });

    expect(outcome).toBe("requeued");
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
  });

  it("holds at the retry cap", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: ["a1", "a2", "a3", "a4"].map((id) => attemptRow({ id })),
    });

    const outcome = await applyProviderVerdict(payload, target(), {
      status: "FAILED",
      transactionId: "42",
    });

    expect(outcome).toBe("held");
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
  });

  it("does not override a person's hold", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow({ fulfilmentStatus: "on_hold" })],
    });

    const outcome = await applyProviderVerdict(
      payload,
      target({ currentStatus: "on_hold" }),
      { status: "SUCCESSFUL", transactionId: "42" }
    );

    expect(outcome).toBe("unchanged");
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
    expect(collections["giveaway-fulfilment-attempts"]).toHaveLength(0);
  });

  it("does not clear a hold by re-queueing a failure", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow({ fulfilmentStatus: "on_hold" })],
    });

    const outcome = await applyProviderVerdict(
      payload,
      target({ currentStatus: "on_hold" }),
      { status: "FAILED", transactionId: "42" }
    );

    expect(outcome).toBe("unchanged");
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
    expect(collections["giveaway-fulfilment-attempts"]).toHaveLength(0);
  });

  it("passes the confirmed transaction id so the retry gets a fresh key", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });
    const verdict: ProviderVerdict = {
      status: "FAILED",
      transactionId: "77",
      message: "INSUFFICIENT_BALANCE",
    };

    await applyProviderVerdict(payload, target(), verdict);

    const attempt = collections["giveaway-fulfilment-attempts"].at(-1);
    expect(attempt?.providerTransactionId).toBe(verdict.transactionId);
    expect(attempt?.outcome).toBe("retryable_failure");
  });
});

describe("latestProviderTransactionId", () => {
  it("skips rows that carry no id and takes the newest that does", async () => {
    expect(
      latestProviderTransactionId([
        { providerTransactionId: undefined },
        { providerTransactionId: "41" },
      ])
    ).toBe("41");
  });

  it("returns undefined when no row carries an id", async () => {
    expect(
      latestProviderTransactionId([
        { providerTransactionId: null },
        { providerTransactionId: "" },
      ])
    ).toBeUndefined();
  });
});
