import { describe, expect, it } from "bun:test";
import { fulfilPendingPrizes } from "@news-spend-media/payload/lib/giveaway/fulfilPrizes";
import { ReloadlyError } from "@news-spend-media/payload/lib/giveaway/reloadly";

type Row = Record<string, any>;

function winnerRow(overrides: Row = {}): Row {
  return {
    id: "w1",
    claimStatus: "claimed",
    fulfilmentStatus: "pending",
    claimPhone: "08031234567",
    prize: { id: "cat-1", fulfilmentType: "airtime", valueNaira: 500 },
    ...overrides,
  };
}

function createFakePayload({ winners = [] }: { winners?: Row[] } = {}) {
  const collections: Record<string, Row[]> = {
    "giveaway-winners": winners,
    "giveaway-fulfilment-attempts": [],
  };
  const created: Record<string, Row[]> = {};

  const payload: any = {
    logger: { warn: () => undefined, error: () => undefined },
    find: async ({ collection, where, sort, limit }: Row) => {
      let docs = (collections[collection] ?? []).filter((row) =>
        matchesWhere(row, where)
      );
      if (limit) {
        docs = docs.slice(0, limit);
      }
      return { docs, totalDocs: docs.length };
    },
    count: async ({ collection, where }: Row) => {
      const docs = (collections[collection] ?? []).filter((row) =>
        matchesWhere(row, where)
      );
      return { totalDocs: docs.length };
    },
    create: async ({ collection, data }: Row) => {
      const row = {
        id: `${collection}-${(created[collection]?.length ?? 0) + 1}`,
        ...data,
      };
      created[collection] = [...(created[collection] ?? []), row];
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

  return { payload, collections, created };
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
    if (clause?.equals !== undefined) {
      return String(actual) === String(clause.equals);
    }
    return true;
  });
}

/** A fake ReloadlyClient the test controls the outcome of. */
function fakeClient({
  detectOperator = async () => ({ operatorId: 341, name: "MTN Nigeria" }),
  topup,
  isSandbox = true,
}: {
  detectOperator?: () => Promise<Row>;
  topup: (args: Row) => Promise<Row>;
  isSandbox?: boolean;
}): any {
  return { isSandbox, detectOperator, topup };
}

describe("fulfilPendingPrizes", () => {
  it("does nothing when Reloadly is not configured", async () => {
    const { payload, created } = createFakePayload({ winners: [winnerRow()] });

    // No client passed and no env vars set — the module must not throw for
    // an unconfigured provider, only decline to act.
    const summary = await fulfilPendingPrizes(payload);

    expect(summary).toEqual({ attempted: 0, sent: 0, failed: 0, skipped: 0 });
    expect(created["giveaway-fulfilment-attempts"]).toBeUndefined();
  });

  it("sends a top-up and marks the prize fulfilled", async () => {
    const { payload, collections, created } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => ({ transactionId: 999, operatorName: "MTN Nigeria" }),
    });

    const summary = await fulfilPendingPrizes(payload, { client });

    expect(summary).toEqual({ attempted: 1, sent: 1, failed: 0, skipped: 0 });
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
    expect(created["giveaway-fulfilment-attempts"]?.[0]).toMatchObject({
      outcome: "sent",
      providerTransactionId: "999",
      localAmount: 500,
    });
  });

  it("ignores a prize the provider does not deliver", async () => {
    const { payload, collections } = createFakePayload({
      winners: [
        winnerRow({ prize: { id: "cat-2", fulfilmentType: "physical" } }),
      ],
    });
    const client = fakeClient({ topup: async () => ({}) });

    const summary = await fulfilPendingPrizes(payload, { client });

    expect(summary.attempted).toBe(0);
    // Untouched — a physical prize is somebody else's job entirely.
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
  });

  it("ignores a winner that is not pending", async () => {
    const { payload } = createFakePayload({
      winners: [winnerRow({ fulfilmentStatus: "on_hold" })],
    });
    const client = fakeClient({ topup: async () => ({}) });

    const summary = await fulfilPendingPrizes(payload, { client });

    // on_hold must keep stopping a dispatch, not be silently paid out.
    expect(summary.attempted).toBe(0);
  });

  it("holds a prize with no phone number rather than guessing", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow({ claimPhone: null })],
    });
    const client = fakeClient({ topup: async () => ({}) });

    const summary = await fulfilPendingPrizes(payload, { client });

    expect(summary.skipped).toBe(1);
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
  });

  it("holds a data prize with no plans configured for any network", async () => {
    const { payload, collections } = createFakePayload({
      winners: [
        winnerRow({
          prize: {
            id: "cat-3",
            fulfilmentType: "data",
            valueNaira: 600,
            reloadlyDataPlans: [],
          },
        }),
      ],
    });
    const client = fakeClient({ topup: async () => ({}) });

    const summary = await fulfilPendingPrizes(payload, { client });

    // ₦600 buys a different plan on every network — the amount alone cannot
    // pick the bundle, so this must never be inferred.
    expect(summary.skipped).toBe(1);
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
  });

  it("holds a data prize when the winner's network has no configured plan", async () => {
    const { payload, collections } = createFakePayload({
      winners: [
        winnerRow({
          prize: {
            id: "cat-5",
            fulfilmentType: "data",
            // Only MTN is configured for this prize.
            reloadlyDataPlans: [
              {
                network: "mtn",
                reloadlyOperatorId: 345,
                reloadlyLocalAmount: 600,
              },
            ],
          },
        }),
      ],
    });
    // The winner's number turns out to be on Airtel, not MTN.
    const client = fakeClient({
      detectOperator: async () => ({ operatorId: 342, name: "Airtel Nigeria" }),
      topup: async () => ({}),
    });

    const summary = await fulfilPendingPrizes(payload, { client });

    // Sending the MTN bundle to an Airtel SIM would not deliver — an MTN
    // bundle is provisioned by MTN for MTN's own subscribers, the same way a
    // Vodafone bundle does nothing on an EE phone.
    expect(summary.skipped).toBe(1);
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
    expect(collections["giveaway-winners"][0].reviewNote).toContain(
      "Airtel Nigeria"
    );
  });

  it("sends the plan matching the winner's actual detected network", async () => {
    const { payload, created } = createFakePayload({
      winners: [
        winnerRow({
          prize: {
            id: "cat-4",
            fulfilmentType: "data",
            reloadlyDataPlans: [
              {
                network: "mtn",
                reloadlyOperatorId: 345,
                reloadlyLocalAmount: 600,
              },
              {
                network: "airtel",
                reloadlyOperatorId: 646,
                reloadlyLocalAmount: 599.91,
              },
            ],
          },
        }),
      ],
    });
    const client = fakeClient({
      detectOperator: async () => ({ operatorId: 342, name: "Airtel Nigeria" }),
      topup: async (args) => {
        // The Airtel row, not the MTN one that happens to be listed first.
        expect(args.operatorId).toBe(646);
        expect(args.localAmount).toBe(599.91);
        return { transactionId: 1, operatorName: "Airtel Nigeria Data" };
      },
    });

    const summary = await fulfilPendingPrizes(payload, { client });

    expect(summary.sent).toBe(1);
    expect(created["giveaway-fulfilment-attempts"]?.[0].operatorId).toBe(646);
  });

  it("holds a prize the provider permanently rejects", async () => {
    const { payload, collections, created } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => {
        throw new ReloadlyError("invalid phone", 400, null, false);
      },
    });

    const summary = await fulfilPendingPrizes(payload, { client });

    expect(summary.failed).toBe(1);
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
    expect(created["giveaway-fulfilment-attempts"]?.[0].outcome).toBe(
      "permanent_failure"
    );
  });

  it("leaves a retryable failure pending rather than holding it immediately", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => {
        throw new ReloadlyError("gateway timeout", 503, null, true);
      },
    });

    await fulfilPendingPrizes(payload, { client });

    // One transient failure should not take the prize out of the queue —
    // an outage clears on its own within a few hourly passes.
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
  });

  it("holds a prize after enough retryable failures", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => {
        throw new ReloadlyError("gateway timeout", 503, null, true);
      },
    });

    // Five passes, same winner each time, all failing the same way.
    for (let i = 0; i < 5; i += 1) {
      await fulfilPendingPrizes(payload, { client });
    }

    // Left retrying forever would mean nobody ever looks at a payout that is
    // never going to succeed on its own.
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
  });

  it("treats a duplicate-identifier response as already paid, not failed", async () => {
    const { payload, collections, created } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => {
        throw new ReloadlyError(
          "The custom identifier provided has already been used. Please provide a new, unique custom identifier",
          400,
          null,
          false
        );
      },
    });

    const summary = await fulfilPendingPrizes(payload, { client });

    // This is the crash-between-payout-and-record case: the money already
    // went out on an earlier pass. Marking it failed would strand a winner
    // who has, in fact, already been paid.
    expect(summary.sent).toBe(1);
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "fulfilled"
    );
    expect(created["giveaway-fulfilment-attempts"]?.[0].outcome).toBe(
      "already_sent"
    );
  });

  it("records which environment a payout ran in", async () => {
    const { payload, created } = createFakePayload({ winners: [winnerRow()] });
    const client = fakeClient({
      isSandbox: true,
      topup: async () => ({ transactionId: 1 }),
    });

    await fulfilPendingPrizes(payload, { client });

    // A sandbox payout delivered nothing, however successful it looks, so
    // that has to be on the record and not just in the environment variable.
    expect(created["giveaway-fulfilment-attempts"]?.[0].environment).toBe(
      "sandbox"
    );
  });
});
