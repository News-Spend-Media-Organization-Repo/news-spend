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

    expect(summary).toEqual({ checked: 1, fulfilled: 1, requeued: 0, held: 0 });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("asks about the newest transaction the provider acknowledged", async () => {
    // Two sends both left an id behind. Only the latest one can still be
    // settling, so looking up the older one would settle the prize against a
    // transaction that is already finished.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [
        attemptRow({
          id: "a2",
          providerTransactionId: "42",
          attemptedAt: new Date().toISOString(),
        }),
        attemptRow({
          id: "a1",
          providerTransactionId: "41",
          attemptedAt: STALE,
        }),
      ],
    });
    let queried = "";
    const client = fakeClient({
      topupStatus: async (id) => {
        queried = id;
        return { status: "SUCCESSFUL" };
      },
    });

    await reconcileInProgressPrizes(payload, { client });

    expect(queried).toBe("42");
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("only looks at prizes that are still in progress", async () => {
    // A settled prize must not be asked about again: its transaction is
    // finished, and re-reading it could only move a winner backwards.
    const { payload, collections } = createFakePayload({
      winners: [
        winnerRow(),
        winnerRow({ id: "w2", fulfilmentStatus: "fulfilled" }),
        winnerRow({ id: "w3", fulfilmentStatus: "pending" }),
      ],
      attempts: [attemptRow()],
    });
    const client = fakeClient({
      topupStatus: async () => ({ status: "SUCCESSFUL" }),
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary).toEqual({ checked: 1, fulfilled: 1, requeued: 0, held: 0 });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
    expect(collections["giveaway-winners"][1].fulfilmentStatus).toBe(
      "fulfilled"
    );
    expect(collections["giveaway-winners"][2].fulfilmentStatus).toBe("pending");
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

    expect(summary).toEqual({ checked: 1, fulfilled: 0, requeued: 0, held: 0 });
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

    expect(summary).toEqual({ checked: 1, fulfilled: 0, requeued: 1, held: 0 });
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

    expect(summary).toEqual({ checked: 1, fulfilled: 1, requeued: 0, held: 0 });
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

    expect(summary).toEqual({ checked: 0, fulfilled: 0, requeued: 0, held: 0 });
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

  it("re-queues a prize the provider reported failed", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });
    const client = fakeClient({
      topupStatus: async () => ({ status: "FAILED" }),
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary).toEqual({ checked: 1, fulfilled: 0, requeued: 1, held: 0 });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
    expect(collections["giveaway-fulfilment-attempts"]?.at(-1)?.outcome).toBe(
      "retryable_failure"
    );
    // The id is what makes Task 2's key advance on the next attempt. Without it
    // the retry reuses an identifier the provider already spent, gets refused, and
    // reads the refusal as "already sent" while the winner is unpaid — the case
    // this plan exists to fix. This assertion is the only place that contract is
    // pinned against a real writer rather than a seeded fixture.
    expect(
      collections["giveaway-fulfilment-attempts"]?.at(-1)?.providerTransactionId
    ).toBe("42");
  });

  it("re-queues a prize the provider refunded", async () => {
    // The money came back, so the winner is unpaid and the prize is retryable,
    // exactly as for FAILED.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });
    const client = fakeClient({
      topupStatus: async () => ({ status: "REFUNDED" }),
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary.requeued).toBe(1);
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
  });

  it("holds a prize whose transaction the provider does not recognise", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });
    const client = fakeClient({
      topupStatus: async () => {
        throw new ReloadlyError("TRANSACTION_NOT_FOUND", 404, null, false);
      },
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    // Our record and the provider's disagree about money. Re-sending is a guess
    // with a payout behind it and re-reading it would loop forever, so a person
    // decides.
    expect(summary).toEqual({ checked: 1, fulfilled: 0, requeued: 0, held: 1 });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
    expect(collections["giveaway-winners"][0].reviewNote).toContain("42");
  });

  it("holds a prize that keeps failing once the retry cap is reached", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [
        attemptRow(),
        ...["a2", "a3", "a4", "a5"].map((id) =>
          attemptRow({ id, outcome: "retryable_failure" })
        ),
      ],
    });
    const client = fakeClient({
      topupStatus: async () => ({ status: "FAILED" }),
    });

    const summary = await reconcileInProgressPrizes(payload, { client });

    expect(summary.held).toBe(1);
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
  });
});
