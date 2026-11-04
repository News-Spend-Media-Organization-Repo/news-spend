import { describe, expect, it } from "vitest";
import { reconcileInProgressPrizes } from "../reconcilePrizes";

const STALE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const successfulOrder = {
  transactionId: 42,
  status: "SUCCESSFUL",
  currencyCode: "NGN",
  amount: 4900,
  product: {
    productId: 7,
    productName: "Amazon Nigeria",
    unitPrice: 5000,
    totalPrice: 5000,
    currencyCode: "NGN",
  },
};

const code = {
  cardNumber: "CARD-1",
  pinCode: "1234",
  redemptionUrl: "https://redeem",
};

function giftCardPrize(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    fulfilmentType: "gift_card",
    reloadlyGiftCardProductId: 7,
    reloadlyGiftCardUnitPrice: 5000,
    reloadlyGiftCardProductName: "Amazon Nigeria",
    reloadlyGiftCardInstructions: "Redeem on amazon.com",
    ...overrides,
  };
}

function winnerWithPrize(overrides: Record<string, unknown> = {}) {
  return {
    id: "w1",
    claimStatus: "claimed",
    fulfilmentStatus: "in_progress",
    updatedAt: STALE,
    user: { id: "u1", email: "u1@example.com" },
    prize: giftCardPrize(),
    ...overrides,
  };
}

function fakeGiftCardClient(
  overrides: {
    findTransaction?: (id: string) => unknown;
    getTransactionResult?: unknown;
    getTransactionError?: Error;
    code?: unknown;
    codeError?: Error;
  } = {}
) {
  const findCalls: string[] = [];
  const getCodeCalls: Array<string | number> = [];
  const getTransactionCalls: Array<string | number> = [];

  return {
    isSandbox: true,
    findCalls,
    getCodeCalls,
    getTransactionCalls,
    async findTransaction(id: string) {
      findCalls.push(id);
      return overrides.findTransaction?.(id) ?? null;
    },
    async getTransaction(id: string | number) {
      getTransactionCalls.push(id);
      if (overrides.getTransactionError) {
        throw overrides.getTransactionError;
      }
      return overrides.getTransactionResult ?? successfulOrder;
    },
    async getCode(id: string | number) {
      getCodeCalls.push(id);
      if (overrides.codeError) {
        throw overrides.codeError;
      }
      return overrides.code ?? code;
    },
  };
}

function fakePayload(
  winners: unknown[],
  options: { sendEmailError?: Error } = {}
) {
  const updates: Array<{
    collection: string;
    id: string;
    data: Record<string, unknown>;
  }> = [];
  const creates: Array<{ collection: string; data: Record<string, unknown> }> =
    [];
  const emails: unknown[] = [];

  // Mutable winner state so later passes see writes from earlier ones.
  const state = new Map(
    winners.map((winner) => {
      const doc = winner as Record<string, unknown>;
      return [doc.id as string, { ...doc }];
    })
  );

  const payload = {
    find: async (args: { collection: string }) => {
      if (args.collection === "giveaway-winners") {
        return { docs: Array.from(state.values()), totalDocs: state.size };
      }
      return { docs: [], totalDocs: 0 };
    },
    findByID: async (args: { id: string }) => ({
      id: args.id,
      prizeName: "A prize",
      user: { id: "u1" },
    }),
    update: async (args: {
      collection: string;
      id: string;
      data: Record<string, unknown>;
    }) => {
      updates.push({
        collection: args.collection,
        id: args.id,
        data: args.data,
      });
      const current = state.get(args.id);
      if (current) {
        state.set(args.id, { ...current, ...args.data });
      }
      return {};
    },
    create: async (args: {
      collection: string;
      data: Record<string, unknown>;
    }) => {
      creates.push({ collection: args.collection, data: args.data });
      return { id: "created" };
    },
    count: async () => ({ totalDocs: 0 }),
    sendEmail: async (args: unknown) => {
      emails.push(args);
      if (options.sendEmailError) {
        throw options.sendEmailError;
      }
    },
    findGlobal: async () => null,
    logger: {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
    },
    db: { drizzle: { execute: async () => ({ rows: [] }) } },
  };

  return { payload, updates, creates, emails };
}

const topupClient = { isSandbox: true } as never;

describe("gift card reconciliation", () => {
  it("fulfils an in-progress gift card that already has a transaction id", async () => {
    const { payload, updates, creates } = fakePayload([
      winnerWithPrize({ giftCardTransactionId: "42" }),
    ]);
    const client = fakeGiftCardClient();

    const summary = await reconcileInProgressPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(client.getTransactionCalls).toEqual(["42"]);
    expect(client.getCodeCalls).toEqual([42]);

    const winnerUpdate = updates.find((u) => u.data.giftCardCode);
    expect(winnerUpdate?.data).toMatchObject({
      giftCardCode: "CARD-1",
      giftCardPin: "1234",
      giftCardRedemptionUrl: "https://redeem",
      giftCardInstructions: "Redeem on amazon.com",
      fulfilmentStatus: "fulfilled",
    });

    const attempts = creates.filter(
      (c) => c.collection === "giveaway-fulfilment-attempts"
    );
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.data).toMatchObject({
      outcome: "already_sent",
      providerReference: "gift-card:w1",
      providerTransactionId: "42",
      operatorName: "Amazon Nigeria",
      localAmount: 4900,
    });

    expect(summary).toEqual({ checked: 1, fulfilled: 1, requeued: 0, held: 0 });
  });

  it("requeues a gift card whose transaction is still processing", async () => {
    const { payload, updates } = fakePayload([
      winnerWithPrize({ giftCardTransactionId: "42" }),
    ]);
    const client = fakeGiftCardClient({
      getTransactionResult: { ...successfulOrder, status: "PROCESSING" },
    });

    const summary = await reconcileInProgressPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(client.getCodeCalls).toHaveLength(0);
    expect(updates.some((u) => u.data.fulfilmentStatus === "pending")).toBe(
      true
    );
    expect(updates.some((u) => u.data.fulfilmentStatus === "fulfilled")).toBe(
      false
    );
    expect(summary).toEqual({ checked: 1, fulfilled: 0, requeued: 1, held: 0 });
  });

  it("holds a gift card whose order failed", async () => {
    const { payload, updates } = fakePayload([
      winnerWithPrize({ giftCardTransactionId: "42" }),
    ]);
    const client = fakeGiftCardClient({
      getTransactionResult: { ...successfulOrder, status: "FAILED" },
    });

    const summary = await reconcileInProgressPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(client.getCodeCalls).toHaveLength(0);
    expect(updates.some((u) => u.data.fulfilmentStatus === "on_hold")).toBe(
      true
    );
    expect(summary).toEqual({ checked: 1, fulfilled: 0, requeued: 0, held: 1 });
  });

  it("requeues a gift card with no transaction id and no provider transaction", async () => {
    const { payload, updates } = fakePayload([winnerWithPrize()]);
    const client = fakeGiftCardClient();

    const summary = await reconcileInProgressPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(client.findCalls).toEqual(["gift-card:w1"]);
    expect(client.getTransactionCalls).toHaveLength(0);
    expect(updates.some((u) => u.data.fulfilmentStatus === "pending")).toBe(
      true
    );
    expect(summary).toEqual({ checked: 1, fulfilled: 0, requeued: 1, held: 0 });
  });

  it("emails a recovered card when enabled", async () => {
    const { payload, updates, emails } = fakePayload([
      winnerWithPrize({ giftCardTransactionId: "42" }),
    ]);
    const client = fakeGiftCardClient();

    const summary = await reconcileInProgressPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: "u1@example.com" });
    expect(updates.some((u) => u.data.giftCardEmailSentAt)).toBe(true);
    expect(summary).toEqual({ checked: 1, fulfilled: 1, requeued: 0, held: 0 });
  });

  it("does not email a recovered card when disabled", async () => {
    const { payload, updates, emails } = fakePayload([
      winnerWithPrize({
        giftCardTransactionId: "42",
        prize: giftCardPrize({ emailGiftCardCode: false }),
      }),
    ]);
    const client = fakeGiftCardClient();

    await reconcileInProgressPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(emails).toHaveLength(0);
    expect(updates.some((u) => u.data.fulfilmentStatus === "fulfilled")).toBe(
      true
    );
    expect(updates.some((u) => u.data.giftCardEmailSentAt)).toBe(false);
  });

  it("does not email a recovered card when the winner has no email", async () => {
    const { payload, updates, emails } = fakePayload([
      winnerWithPrize({
        giftCardTransactionId: "42",
        user: { id: "u1", email: "" },
      }),
    ]);
    const client = fakeGiftCardClient();

    await reconcileInProgressPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(emails).toHaveLength(0);
    expect(updates.some((u) => u.data.fulfilmentStatus === "fulfilled")).toBe(
      true
    );
    expect(updates.some((u) => u.data.giftCardEmailSentAt)).toBe(false);
  });

  it("still fulfils when the email send fails", async () => {
    const { payload, updates, emails } = fakePayload(
      [winnerWithPrize({ giftCardTransactionId: "42" })],
      { sendEmailError: new Error("smtp unreachable") }
    );
    const client = fakeGiftCardClient();

    const summary = await reconcileInProgressPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(emails).toHaveLength(1);
    expect(updates.some((u) => u.data.fulfilmentStatus === "fulfilled")).toBe(
      true
    );
    expect(updates.some((u) => u.data.giftCardEmailSentAt)).toBe(false);
    expect(summary).toEqual({ checked: 1, fulfilled: 1, requeued: 0, held: 0 });
  });
});
