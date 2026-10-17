import { describe, expect, it } from "bun:test";
import { reconcileInProgressPrizes } from "@news-spend-media/payload/lib/giveaway/reconcilePrizes";
import { ReloadlyError } from "@news-spend-media/payload/lib/giveaway/reloadly";

import { matchesWhere } from "../src/test-utils";

type Row = Record<string, any>;

const STALE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function winnerRow(overrides: Row = {}): Row {
  return {
    id: "w1",
    prizeName: "₦500 Airtime",
    fulfilmentStatus: "in_progress",
    updatedAt: STALE,
    ...overrides,
  };
}

function attemptRow(overrides: Row = {}): Row {
  return {
    id: "a1",
    winner: "w1",
    outcome: "sent",
    providerTransactionId: "42",
    attemptedAt: STALE,
    ...overrides,
  };
}

/**
 * A leaner fake than the fulfilment suite's: only the operations this pass
 * uses. `find` filters with the shared {@link matchesWhere}, so the queries in
 * the pass are exercised rather than stubbed per test.
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
    create: async ({ collection, data }: Row) => {
      const row = {
        id: `${collection}-${(collections[collection]?.length ?? 0) + 1}`,
        ...data,
      };
      collections[collection] = [...(collections[collection] ?? []), row];
      return row;
    },
    update: async ({ collection, id, data }: Row) => {
      const row = collections[collection]?.find((item) => item.id === id);
      if (row) {
        Object.assign(row, data);
      }
      return row ?? { id, ...data };
    },
  };

  return { payload, collections };
}

/** A fake ReloadlyClient exposing the one call this pass makes. */
function fakeClient({
  topupStatus,
}: {
  topupStatus: (transactionId: string) => Promise<Row>;
}): any {
  return { topupStatus };
}

describe("reconcileInProgressPrizes", () => {
  it("settles a prize the provider has since delivered", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });
    const client = fakeClient({
      topupStatus: async () => ({ status: "SUCCESSFUL" }),
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary).toEqual({ checked: 1, fulfilled: 1, requeued: 0 });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("leaves a prize the provider is still processing", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });
    const client = fakeClient({
      topupStatus: async () => ({ status: "PROCESSING" }),
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary).toEqual({ checked: 1, fulfilled: 0, requeued: 0 });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "in_progress"
    );
  });

  it("re-queues a prize that was never given a transaction id", async () => {
    // The run died between claiming the prize and recording the send. The
    // attempt number never advanced, so a re-send reuses the key and cannot
    // pay twice.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topupStatus: async () => {
        throw new Error(
          "must not look up a transaction that was never recorded"
        );
      },
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary).toEqual({ checked: 1, fulfilled: 0, requeued: 1 });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
  });

  it("finds the transaction id even when the newest attempt recorded a failure", async () => {
    // A retryable_failure row records no transaction id. Reading the newest row
    // as "no id" would re-queue a payout the provider is still settling — and a
    // re-send of a payout that did go out is a payout paid twice.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [
        attemptRow({
          id: "a2",
          outcome: "retryable_failure",
          providerTransactionId: undefined,
          attemptedAt: new Date().toISOString(),
        }),
        attemptRow(),
      ],
    });
    const client = fakeClient({
      topupStatus: async () => ({ status: "SUCCESSFUL" }),
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary).toEqual({ checked: 1, fulfilled: 1, requeued: 0 });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("ignores a prize that is still being dispatched", async () => {
    const { payload } = createFakePayload({
      winners: [winnerRow({ updatedAt: new Date().toISOString() })],
      attempts: [attemptRow()],
    });
    const client = fakeClient({
      topupStatus: async () => {
        throw new Error("must not race a live dispatch");
      },
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary).toEqual({ checked: 0, fulfilled: 0, requeued: 0 });
  });

  it("does not throw when the status lookup fails", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });
    const client = fakeClient({
      topupStatus: async () => {
        throw new ReloadlyError("bad gateway", 502, null, true);
      },
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary.checked).toBe(1);
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "in_progress"
    );
  });
});
