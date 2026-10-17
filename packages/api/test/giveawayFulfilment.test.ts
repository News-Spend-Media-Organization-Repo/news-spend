import { describe, expect, it } from "bun:test";
import { fulfilPendingPrizes } from "@news-spend-media/payload/lib/giveaway/fulfilPrizes";
import { notifyFulfilmentHold } from "@news-spend-media/payload/lib/giveaway/notifyFulfilmentHold";
import { ReloadlyError } from "@news-spend-media/payload/lib/giveaway/reloadly";

// A hold now resolves recipients from MODERATION_ALERT_EMAILS as well, so an
// exported value adds a second email and fails the toHaveLength(1) assertions
// below on nothing but the ambient environment. Empty means "no extras".
process.env.MODERATION_ALERT_EMAILS = "";

type Row = Record<string, any>;

function winnerRow(overrides: Row = {}): Row {
  return {
    id: "w1",
    user: "u1",
    prizeName: "₦500 Airtime",
    claimStatus: "claimed",
    fulfilmentStatus: "pending",
    claimPhone: "08031234567",
    prize: { id: "cat-1", fulfilmentType: "airtime", valueNaira: 500 },
    ...overrides,
  };
}

function createFakePayload({
  winners = [],
  attempts = [] as Row[],
  admins = [] as Row[],
  moderationSettings = null as Row | null,
  countFails = false,
}: {
  winners?: Row[];
  attempts?: Row[];
  admins?: Row[];
  moderationSettings?: Row | null;
  countFails?: boolean;
} = {}) {
  const collections: Record<string, Row[]> = {
    "giveaway-winners": winners,
    "giveaway-fulfilment-attempts": attempts,
    admins,
    notifications: [],
    users: [{ id: "u1", email: "winner@example.com", username: "winner" }],
  };
  const emails: Row[] = [];
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
      if (countFails) {
        countFails = false;
        throw new Error("database unavailable");
      }
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
    findByID: async ({ collection, id }: Row) =>
      collections[collection]?.find((row) => String(row.id) === String(id)) ??
      null,
    findGlobal: async () => moderationSettings,
    sendEmail: async (message: Row) => {
      emails.push(message);
      return message;
    },
    update: async ({ collection, id, data }: Row) => {
      const row = collections[collection]?.find((item) => item.id === id);
      if (row) {
        Object.assign(row, data);
      }
      return row ?? { id, ...data };
    },
  };

  return { payload, collections, created, emails };
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
    if (clause?.exists !== undefined) {
      const present = actual !== undefined && actual !== null && actual !== "";
      return clause.exists ? present : !present;
    }
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

    // No client passed and no env vars set: the module must not throw for
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
      topup: async () => ({
        transactionId: 999,
        status: "SUCCESSFUL",
        operatorName: "MTN Nigeria",
      }),
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

  it("does not fulfil a prize the provider is still processing", async () => {
    const { payload, collections, created } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => ({ transactionId: 42, status: "PROCESSING" }),
    });

    await fulfilPendingPrizes(payload, { client });

    // Calling this delivered while it is still settling is the same lie the
    // October record told. "Sending now" is the honest label.
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "in_progress"
    );
    expect(created["giveaway-fulfilment-attempts"]?.[0]).toMatchObject({
      outcome: "sent",
      providerTransactionId: "42",
    });
  });

  it("does not fulfil a prize when the provider reports no status", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => ({ transactionId: 43 }),
    });

    await fulfilPendingPrizes(payload, { client });

    // Silence is unknown, not delivered.
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe(
      "in_progress"
    );
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
    // Untouched: a physical prize is somebody else's job entirely.
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

    // ₦600 buys a different plan on every network. The amount alone cannot
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

    // Sending the MTN bundle to an Airtel SIM would not deliver: an MTN
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
        return {
          transactionId: 1,
          status: "SUCCESSFUL",
          operatorName: "Airtel Nigeria Data",
        };
      },
    });

    const summary = await fulfilPendingPrizes(payload, { client });

    expect(summary.sent).toBe(1);
    expect(created["giveaway-fulfilment-attempts"]?.[0].operatorId).toBe(646);
  });

  it("matches the network by name, not by operator id", async () => {
    const { payload, created } = createFakePayload({
      winners: [
        winnerRow({
          prize: {
            id: "cat-6",
            fulfilmentType: "data",
            reloadlyDataPlans: [
              {
                network: "glo",
                reloadlyOperatorId: 647,
                reloadlyLocalAmount: 1000,
              },
            ],
          },
        }),
      ],
    });
    // The id is deliberately one that means nothing to us, as this is what a
    // switch from Reloadly's sandbox catalogue to the live one looks like.
    // Keying off the id would leave every data prize unroutable; the name
    // still identifies the network.
    const client = fakeClient({
      detectOperator: async () => ({ operatorId: 99_999, name: "Glo Nigeria" }),
      topup: async (args) => {
        expect(args.operatorId).toBe(647);
        return { transactionId: 7, status: "SUCCESSFUL" };
      },
    });

    const summary = await fulfilPendingPrizes(payload, { client });

    expect(summary.sent).toBe(1);
    expect(created["giveaway-fulfilment-attempts"]?.[0].operatorId).toBe(647);
  });

  it("recognises a network from its data operator name", async () => {
    const { payload } = createFakePayload({
      winners: [
        winnerRow({
          prize: {
            id: "cat-7",
            fulfilmentType: "data",
            reloadlyDataPlans: [
              {
                network: "t2",
                reloadlyOperatorId: 645,
                reloadlyLocalAmount: 1000,
              },
            ],
          },
        }),
      ],
    });
    // 9mobile trades under several names across Reloadly's listings.
    const client = fakeClient({
      detectOperator: async () => ({
        operatorId: 1,
        name: "T2 Mobile Nigeria Data",
      }),
      topup: async () => ({ transactionId: 8, status: "SUCCESSFUL" }),
    });

    const summary = await fulfilPendingPrizes(payload, { client });

    expect(summary.sent).toBe(1);
  });

  it("holds rather than guessing when the operator name is unrecognised", async () => {
    const { payload, collections } = createFakePayload({
      winners: [
        winnerRow({
          prize: {
            id: "cat-8",
            fulfilmentType: "data",
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
    const client = fakeClient({
      detectOperator: async () => ({
        operatorId: 500,
        name: "Some New Network",
      }),
      topup: async () => {
        throw new Error("must not send to an unrecognised network");
      },
    });

    const summary = await fulfilPendingPrizes(payload, { client });

    expect(summary.skipped).toBe(1);
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("on_hold");
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
    const { payload, collections, created } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => {
        throw new ReloadlyError("gateway timeout", 503, null, true);
      },
    });

    await fulfilPendingPrizes(payload, { client });

    // One transient failure should not take the prize out of the queue;
    // an outage clears on its own within a few hourly passes.
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
    // The key that request used belongs on the row: it is the evidence a
    // person has when asking whether a request we never got an answer from
    // did reach the provider, and it is the row read after a refused retry.
    expect(created["giveaway-fulfilment-attempts"]?.[0].providerReference).toBe(
      "w1:1"
    );
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

  it("tells the winner when a prize is put on hold", async () => {
    const { payload, collections, emails } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => {
        throw new ReloadlyError("invalid account number", 400, null, false);
      },
    });

    await fulfilPendingPrizes(payload, { client });

    // A silent hold is how a mistyped phone number becomes a prize nobody
    // ever receives: the record says "review", and the winner is never
    // given a reason to go and look at it.
    const notification = collections.notifications![0]!;
    expect(notification).toBeDefined();
    expect(notification.targetType).toBe("specific");
    expect(notification._status).toBe("published");
    expect(notification.specificUsers).toEqual(["u1"]);

    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toBe("winner@example.com");
  });

  it("tells the admins when a payout is held", async () => {
    const { payload, emails } = createFakePayload({
      winners: [winnerRow()],
      admins: [{ id: "a1", email: "ops@example.com", role: "super-admin" }],
    });
    const client = fakeClient({
      topup: async () => {
        throw new ReloadlyError("invalid account number", 400, null, false);
      },
    });

    await fulfilPendingPrizes(payload, { client });

    // hold() told only the winner, which is why the October failure sat unnoticed
    // from the 9th until somebody complained.
    const toAdmin = emails.filter((email) => email.to === "ops@example.com");
    expect(toAdmin).toHaveLength(1);
    expect(toAdmin[0]!.html).toContain("invalid account number");
  });

  describe("notifyFulfilmentHold", () => {
    it("resolves rather than throwing when the mail transport fails", async () => {
      const { payload } = createFakePayload({
        admins: [{ id: "a1", email: "ops@example.com", role: "super-admin" }],
      });
      payload.sendEmail = async () => {
        throw new Error("smtp unreachable");
      };

      const result = await notifyFulfilmentHold(
        payload,
        "w1",
        "Provider rejected the payout: INVALID_ACCOUNT_NUMBER"
      );

      // The prize is already held: a mail server being unreachable must not
      // turn a handled hold into an unhandled failure.
      expect(result).toEqual({ notified: false });
    });

    it("still reaches the other admins when one address fails", async () => {
      const { payload, emails } = createFakePayload({
        admins: [
          { id: "a1", email: "typo@example.com", role: "super-admin" },
          { id: "a2", email: "ops@example.com", role: "super-admin" },
        ],
      });
      payload.sendEmail = async (message: Row) => {
        if (message.to === "typo@example.com") {
          throw new Error("invalid address");
        }
        emails.push(message);
        return message;
      };

      const result = await notifyFulfilmentHold(
        payload,
        "w1",
        "Provider rejected the payout: INVALID_ACCOUNT_NUMBER"
      );

      // One bad address must not silence the copy that would have reached
      // somebody; that is the failure this alert exists to end.
      expect(emails.map((email) => email.to)).toEqual(["ops@example.com"]);
      expect(result).toEqual({ notified: true });
    });

    it("shows the admins the last attempt's amount and reference", async () => {
      const { payload, emails } = createFakePayload({
        admins: [{ id: "a1", email: "ops@example.com", role: "super-admin" }],
        attempts: [
          {
            id: "att-1",
            winner: "w1",
            outcome: "permanent_failure",
            localAmount: 500,
            providerReference: "w1:2",
            attemptedAt: "2026-10-09T00:00:00.000Z",
          },
        ],
      });

      await notifyFulfilmentHold(
        payload,
        "w1",
        "Provider rejected the payout: INVALID_ACCOUNT_NUMBER"
      );

      expect(emails[0]!.html).toContain("500");
      expect(emails[0]!.html).toContain("w1:2");
    });
  });

  it("does not leak the provider's wording to the winner", async () => {
    const { payload, collections, emails } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => {
        throw new ReloadlyError("INVALID_ACCOUNT_NUMBER", 400, null, false);
      },
    });

    await fulfilPendingPrizes(payload, { client });

    // `reviewNote` is written for an administrator. Repeated to a winner it
    // reads as either gibberish or an accusation, so the message says a
    // problem exists and the prize is safe, and nothing else.
    const said =
      JSON.stringify(collections.notifications![0]) + emails[0]!.html;
    expect(said).not.toContain("INVALID_ACCOUNT_NUMBER");
    expect(collections["giveaway-winners"]![0]!.reviewNote).toContain(
      "INVALID_ACCOUNT_NUMBER"
    );
  });

  it("does not tell the winner anything while a failure is still retrying", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });
    const client = fakeClient({
      topup: async () => {
        throw new ReloadlyError("gateway timeout", 503, null, true);
      },
    });

    await fulfilPendingPrizes(payload, { client });

    // A transient outage that clears on the next pass is not news. Only the
    // hold is worth interrupting somebody for.
    expect(collections.notifications!).toHaveLength(0);
  });

  it("keeps a retried prize visible to the next pass", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
    });
    let attempts = 0;
    const client = fakeClient({
      topup: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new ReloadlyError("gateway timeout", 503, null, true);
        }
        return {
          transactionId: 99,
          status: "SUCCESSFUL",
          operatorName: "MTN Nigeria",
        };
      },
    });

    await fulfilPendingPrizes(payload, { client });
    await fulfilPendingPrizes(payload, { client });

    // The sweep selects `pending`, so a prize left marked in-progress after a
    // failure would be invisible to every later pass, retryable in name and
    // abandoned in fact.
    expect(attempts).toBe(2);
    expect(collections["giveaway-winners"]![0]!.fulfilmentStatus).toBe(
      "fulfilled"
    );
  });

  it("treats a duplicate-identifier response as already paid, not failed", async () => {
    const { payload, collections, created } = createFakePayload({
      winners: [winnerRow()],
    });
    let sentIdentifier = "";
    const client = fakeClient({
      topup: async (args) => {
        sentIdentifier = args.customIdentifier;
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
    expect(sentIdentifier).toBe("w1:1");
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
      topup: async () => ({ transactionId: 1, status: "SUCCESSFUL" }),
    });

    await fulfilPendingPrizes(payload, { client });

    // A sandbox payout delivered nothing, however successful it looks, so
    // that has to be on the record and not just in the environment variable.
    expect(created["giveaway-fulfilment-attempts"]?.[0].environment).toBe(
      "sandbox"
    );
  });

  it("numbers the first attempt 1", async () => {
    const { payload, created } = createFakePayload({ winners: [winnerRow()] });
    let sentIdentifier = "";
    const client = fakeClient({
      topup: async (args) => {
        sentIdentifier = args.customIdentifier;
        return { transactionId: 1, status: "SUCCESSFUL" };
      },
    });

    await fulfilPendingPrizes(payload, { client });

    expect(sentIdentifier).toBe("w1:1");
    expect(created["giveaway-fulfilment-attempts"]?.[0].providerReference).toBe(
      "w1:1"
    );
  });

  it("advances the key only for a failure the provider confirmed", async () => {
    // One confirmed failure: the identifier it consumed is spent, so the retry
    // must not reuse it.
    const { payload } = createFakePayload({
      winners: [winnerRow()],
      attempts: [
        {
          winner: "w1",
          outcome: "retryable_failure",
          providerTransactionId: "11",
        },
      ],
    });
    let sentIdentifier = "";
    const client = fakeClient({
      topup: async (args) => {
        sentIdentifier = args.customIdentifier;
        return { transactionId: 2, status: "SUCCESSFUL" };
      },
    });

    await fulfilPendingPrizes(payload, { client });

    expect(sentIdentifier).toBe("w1:2");
  });

  it("reuses the key after a failure the provider never confirmed", async () => {
    // A timeout or a 5xx may or may not have created a transaction, and the
    // response that would say which never arrived. Reusing the key is what
    // makes that safe: if it did go out, Reloadly refuses the repeat and the
    // existing isAlreadySent check reads it correctly instead of paying a
    // second time.
    const { payload } = createFakePayload({
      winners: [winnerRow()],
      attempts: [{ winner: "w1", outcome: "retryable_failure" }],
    });
    let sentIdentifier = "";
    const client = fakeClient({
      topup: async (args) => {
        sentIdentifier = args.customIdentifier;
        return { transactionId: 3, status: "SUCCESSFUL" };
      },
    });

    await fulfilPendingPrizes(payload, { client });

    expect(sentIdentifier).toBe("w1:1");
  });

  it("does not dispatch when the attempt count cannot be read", async () => {
    const { payload, collections } = createFakePayload({
      winners: [winnerRow()],
      countFails: true,
    });
    const client = fakeClient({
      topup: async () => {
        throw new Error("must not send on a guessed identifier");
      },
    });

    await fulfilPendingPrizes(payload, { client });

    // Guessing the number would either refuse a legitimate retry or re-send a
    // payout that already went out.
    expect(collections["giveaway-winners"][0].fulfilmentStatus).toBe("pending");
  });
});
