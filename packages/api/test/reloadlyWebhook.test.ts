import { describe, expect, it } from "bun:test";
import {
  applyReloadlyCallback,
  type ReloadlyCallback,
} from "@news-spend-media/payload/lib/giveaway/reloadlyWebhook";

import { matchesWhere } from "../src/test-utils";

type Row = Record<string, any>;

const STALE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function winnerRow(overrides: Row = {}): Row {
  return {
    id: "w1",
    prizeName: "₦500 Airtime",
    fulfilmentStatus: "in_progress",
    claimPhone: "2348000000000",
    ...overrides,
  };
}

function attemptRow(overrides: Row = {}): Row {
  return {
    id: "a1",
    winner: "w1",
    provider: "reloadly",
    environment: "live",
    outcome: "sent",
    providerReference: "w1:1",
    providerTransactionId: "33017710",
    localAmount: 500,
    attemptedAt: STALE,
    ...overrides,
  };
}

function callback(overrides: Partial<ReloadlyCallback> = {}): ReloadlyCallback {
  return {
    type: "airtime_transaction.status",
    liveMode: true,
    status: "SUCCESSFUL",
    transactionId: "33017710",
    customIdentifier: null,
    message: null,
    ...overrides,
  };
}

/**
 * A leaner fake than the fulfilment suite's: only the operations the applier
 * uses. `find` and `count` filter with the shared {@link matchesWhere}, and the
 * attempt log is a real collection rather than a stub, so the duplicate and
 * superseded queries are exercised rather than asserted against a seeded shape.
 * `calls` records every operation so a test can prove that a refused callback
 * wrote nothing.
 */
function createFakePayload({
  winners = [],
  attempts = [],
  failAttemptCreateOnce = false,
}: {
  winners?: Row[];
  attempts?: Row[];
  /** Makes the next attempt-row write reject once, as a full database can. */
  failAttemptCreateOnce?: boolean;
} = {}) {
  const collections: Record<string, Row[]> = {
    "giveaway-winners": winners,
    "giveaway-fulfilment-attempts": attempts,
  };

  const calls: { op: string; collection: string }[] = [];
  let attemptCreateFails = failAttemptCreateOnce;

  const payload: any = {
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    find: async ({ collection, where, sort, limit }: Row) => {
      calls.push({ op: "find", collection });
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
    // Like real Payload: an unknown id throws unless the caller opts out with
    // `disableErrors`, in which case it returns null. That is what lets the
    // applier tell "this winner is gone" from "the database is unreachable".
    findByID: async ({ collection, id, disableErrors }: Row) => {
      calls.push({ op: "findByID", collection });
      const row = collections[collection]?.find(
        (item) => String(item.id) === String(id)
      );
      if (row) {
        return row;
      }
      if (disableErrors) {
        return null;
      }
      throw Object.assign(new Error("Not Found"), {
        name: "NotFound",
        status: 404,
      });
    },
    count: async ({ collection, where }: Row) => {
      calls.push({ op: "count", collection });
      return {
        totalDocs: (collections[collection] ?? []).filter((row) =>
          matchesWhere(row, where)
        ).length,
      };
    },
    create: async ({ collection, data }: Row) => {
      calls.push({ op: "create", collection });
      if (attemptCreateFails && collection === "giveaway-fulfilment-attempts") {
        attemptCreateFails = false;
        throw new Error("attempt write failed");
      }
      const row = {
        id: `${collection}-${(collections[collection]?.length ?? 0) + 1}`,
        ...data,
      };
      collections[collection] = [...(collections[collection] ?? []), row];
      return row;
    },
    update: async ({ collection, id, data }: Row) => {
      calls.push({ op: "update", collection });
      const row = collections[collection]?.find((item) => item.id === id);
      if (row) {
        Object.assign(row, data);
      }
      return row ?? { id, ...data };
    },
    sendEmail: async () => undefined,
  };

  const writes = () =>
    calls.filter((call) => call.op === "create" || call.op === "update");

  return { payload, collections, calls, writes };
}

describe("applyReloadlyCallback", () => {
  it("matches by transaction id and fulfils on SUCCESSFUL", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ status: "SUCCESSFUL" })
    );

    expect(result).toEqual({ outcome: "fulfilled" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("matches by custom identifier when there is no id", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow({ providerTransactionId: undefined })],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ transactionId: null, customIdentifier: "w1:1" })
    );

    expect(result).toEqual({ outcome: "fulfilled" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("matches by transaction id when both ids point at different rows", async () => {
    // The transaction id is the stronger identity: it names the payout the
    // provider actually moved. Matching the reference instead would settle the
    // wrong winner's prize.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow(), winnerRow({ id: "w2" })],
      attempts: [
        attemptRow({
          id: "a2",
          winner: "w2",
          providerTransactionId: "999",
          providerReference: "w2:1",
        }),
        attemptRow({ id: "a1" }),
      ],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ transactionId: "33017710", customIdentifier: "w2:1" })
    );

    expect(result).toEqual({ outcome: "fulfilled" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
    expect(collections["giveaway-winners"][1].fulfilmentStatus).toBe(
      "in_progress"
    );
  });

  it("changes nothing for an unknown transaction id", async () => {
    const { payload, collections, writes } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ transactionId: "does-not-exist" })
    );

    expect(result).toEqual({
      outcome: "ignored",
      reason: "unknown transaction",
    });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "in_progress"
    );
    expect(writes()).toHaveLength(0);
  });

  it("changes nothing for a callback with no transaction", async () => {
    const { payload, writes } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ transactionId: null, customIdentifier: null })
    );

    expect(result).toEqual({
      outcome: "ignored",
      reason: "unknown transaction",
    });
    expect(writes()).toHaveLength(0);
  });

  it("refuses a callback from the other environment", async () => {
    const { payload, collections, writes } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow({ environment: "live" })],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ liveMode: false })
    );

    expect(result).toEqual({
      outcome: "ignored",
      reason: "environment mismatch",
    });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "in_progress"
    );
    expect(writes()).toHaveLength(0);
  });

  it("refuses a callback with no environment at all", async () => {
    // A null `liveMode` is not a live `true`: it must settle neither
    // environment, or a sandbox callback could mark a live payout paid.
    for (const environment of ["live", "sandbox"]) {
      const { payload, writes } = createFakePayload({
        winners: [winnerRow()],
        attempts: [attemptRow({ environment })],
      });

      const result = await applyReloadlyCallback(
        payload,
        callback({ liveMode: null })
      );

      expect(result).toEqual({
        outcome: "ignored",
        reason: "environment mismatch",
      });
      expect(writes()).toHaveLength(0);
    }
  });

  it("ignores a verdict for a superseded dispatch", async () => {
    // A second dispatch is in flight. Its failure is the only one that may
    // move the prize; applying the older one would re-queue the winner while
    // the current payout is still running, and the sweep would pay twice.
    const { payload, collections, writes } = createFakePayload({
      winners: [winnerRow()],
      attempts: [
        attemptRow({
          id: "a2",
          providerTransactionId: "999",
          attemptedAt: new Date().toISOString(),
        }),
        attemptRow({ id: "a1", attemptedAt: STALE }),
      ],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ status: "FAILED", transactionId: "33017710" })
    );

    expect(result).toEqual({ outcome: "ignored", reason: "superseded" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "in_progress"
    );
    expect(writes()).toHaveLength(0);
  });

  it("drops a redelivered failure", async () => {
    // The failure was recorded when Reloadly first posted it. Applying the
    // callback again would spend one of the five retries on nothing.
    const { payload, collections, writes } = createFakePayload({
      winners: [winnerRow()],
      attempts: [
        attemptRow({
          id: "a2",
          outcome: "retryable_failure",
          attemptedAt: new Date().toISOString(),
        }),
        attemptRow({ id: "a1" }),
      ],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ status: "FAILED" })
    );

    expect(result).toEqual({ outcome: "duplicate" });
    expect(
      collections["giveaway-fulfilment-attempts"].filter(
        (row) => row.outcome === "retryable_failure"
      )
    ).toHaveLength(1);
    expect(writes()).toHaveLength(0);
  });

  it("drops a redelivered failure with no transaction id", async () => {
    // The first callback matched the sent row by its key and re-queued the
    // prize. The settlement row it left behind is built by the writer, not
    // seeded here, and carries the key it settled — so the redelivery is
    // recognised. Without that key the second callback appends a second
    // failure row and burns one of the five retries.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow({ providerTransactionId: undefined })],
    });
    const redelivery = callback({
      status: "FAILED",
      transactionId: null,
      customIdentifier: "w1:1",
    });

    const first = await applyReloadlyCallback(payload, redelivery);
    const second = await applyReloadlyCallback(payload, redelivery);

    expect(first).toEqual({ outcome: "requeued" });
    expect(second).toEqual({ outcome: "duplicate" });
    expect(
      collections["giveaway-fulfilment-attempts"].filter(
        (row) => row.outcome === "retryable_failure"
      )
    ).toHaveLength(1);
    expect(
      collections["giveaway-fulfilment-attempts"].at(-1)?.providerReference
    ).toBe("w1:1");
  });

  it("surfaces a failed attempt-row write instead of answering 200", async () => {
    // The row is the only record of what the provider said, and a 200 tells
    // Reloadly to stop retrying, so losing it here is permanent. The applier
    // must reject; the handler turns that into a 5xx. The writer has already
    // moved the winner by then, which the retry's idempotency absorbs.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
      failAttemptCreateOnce: true,
    });

    await expect(
      applyReloadlyCallback(payload, callback({ status: "FAILED" }))
    ).rejects.toThrow("attempt write failed");

    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
    expect(
      collections["giveaway-fulfilment-attempts"].filter(
        (row) => row.outcome === "retryable_failure"
      )
    ).toHaveLength(0);
  });

  it("does not drop a redelivered SUCCESSFUL as a duplicate", async () => {
    // A failure was recorded for this transaction, but the provider has since
    // confirmed it paid: a success is never a redelivery to ignore, even
    // though a settlement row for the same transaction id exists.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [
        attemptRow({
          id: "a2",
          outcome: "retryable_failure",
          attemptedAt: new Date().toISOString(),
        }),
        attemptRow({ id: "a1" }),
      ],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ status: "SUCCESSFUL" })
    );

    expect(result).toEqual({ outcome: "fulfilled" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("re-queues a FAILED and records the provider's reason", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [
        attemptRow(),
        // A row belonging to a different winner. If the duplicate count
        // ignored its filter this callback would read as a redelivery and
        // never re-queue.
        attemptRow({
          id: "a9",
          winner: "w9",
          outcome: "retryable_failure",
          providerReference: "w9:1",
          providerTransactionId: "999",
        }),
      ],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ status: "FAILED", message: "INSUFFICIENT_BALANCE" })
    );

    expect(result).toEqual({ outcome: "requeued" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
    const recorded = collections["giveaway-fulfilment-attempts"].at(-1);
    expect(recorded?.outcome).toBe("retryable_failure");
    expect(recorded?.error).toBe("INSUFFICIENT_BALANCE");
    expect(recorded?.providerTransactionId).toBe("33017710");
  });

  it("re-queues a REFUNDED", async () => {
    // Matched by key: the callback carries no transaction id, so the retry is
    // told the key is spent with the id from our own attempt row.
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({
        status: "REFUNDED",
        transactionId: null,
        customIdentifier: "w1:1",
      })
    );

    expect(result).toEqual({ outcome: "requeued" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
    expect(
      collections["giveaway-fulfilment-attempts"].at(-1)?.providerTransactionId
    ).toBe("33017710");
  });

  it("leaves a PROCESSING callback alone", async () => {
    const { payload, collections, writes } = createFakePayload({
      winners: [winnerRow()],
      attempts: [attemptRow()],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ status: "PROCESSING" })
    );

    expect(result).toEqual({ outcome: "unchanged" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "in_progress"
    );
    expect(writes()).toHaveLength(0);
  });

  it("does not error on SUCCESSFUL for an already-fulfilled winner", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow({ fulfilmentStatus: "fulfilled" })],
      attempts: [attemptRow()],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ status: "SUCCESSFUL" })
    );

    expect(result).toEqual({ outcome: "fulfilled" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("leaves a held winner untouched", async () => {
    // A person put this prize on hold. A SUCCESSFUL callback must not quietly
    // undo that decision.
    const { payload, collections, writes } = createFakePayload({
      winners: [winnerRow({ fulfilmentStatus: "on_hold" })],
      attempts: [attemptRow()],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ status: "SUCCESSFUL" })
    );

    expect(result).toEqual({ outcome: "unchanged" });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
    expect(writes()).toHaveLength(0);
  });

  it("changes nothing when the winner no longer exists", async () => {
    const { payload, writes } = createFakePayload({
      winners: [],
      attempts: [attemptRow()],
    });

    const result = await applyReloadlyCallback(
      payload,
      callback({ status: "SUCCESSFUL" })
    );

    expect(result).toEqual({ outcome: "ignored", reason: "unknown winner" });
    expect(writes()).toHaveLength(0);
  });
});
