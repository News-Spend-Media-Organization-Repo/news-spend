import { describe, expect, it } from "vitest";
import { fulfilPendingPrizes } from "../fulfilPrizes";
import { ReloadlyError } from "../reloadly";
import type { GiftCardProduct } from "../reloadlyGiftCards";

const product: GiftCardProduct = {
  productId: 7,
  productName: "Amazon Nigeria",
  denominationType: "FIXED",
  recipientCurrencyCode: "NGN",
  senderCurrencyCode: "NGN",
  fixedRecipientDenominations: [5000, 10_000],
  fixedSenderDenominations: [5000, 10_000],
  minRecipientDenomination: null,
  maxRecipientDenomination: null,
  minSenderDenomination: null,
  maxSenderDenomination: null,
  redeemInstructions: { concise: "Redeem on amazon.com" },
};

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
    fulfilmentStatus: "pending",
    user: { id: "u1", email: "u1@example.com" },
    prize: giftCardPrize(),
    ...overrides,
  };
}

type OrderArgs = {
  productId: number;
  unitPrice: number;
  customIdentifier: string;
};

function fakeGiftCardClient(
  overrides: {
    product?: GiftCardProduct;
    productError?: Error;
    orderResult?: unknown;
    orderError?: Error;
    findTransaction?: (id: string) => unknown;
    getTransactionResult?: unknown;
    getTransactionError?: Error;
    code?: unknown;
    codeError?: Error;
  } = {}
) {
  const orderCalls: OrderArgs[] = [];
  const findCalls: string[] = [];
  const getProductCalls: number[] = [];
  const getCodeCalls: Array<string | number> = [];
  const getTransactionCalls: Array<string | number> = [];

  return {
    isSandbox: true,
    orderCalls,
    findCalls,
    getProductCalls,
    getCodeCalls,
    getTransactionCalls,
    async getProduct(id: number) {
      getProductCalls.push(id);
      if (overrides.productError) {
        throw overrides.productError;
      }
      return overrides.product ?? product;
    },
    async order(args: OrderArgs) {
      orderCalls.push(args);
      if (overrides.orderError) {
        throw overrides.orderError;
      }
      return overrides.orderResult ?? successfulOrder;
    },
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

function fakePayload(winners: unknown[]) {
  const updates: Array<{
    collection: string;
    id: string;
    data: Record<string, unknown>;
  }> = [];
  const creates: Array<{ collection: string; data: Record<string, unknown> }> =
    [];
  const emails: unknown[] = [];

  // Mutable winner state so a second sweep pass sees writes from the first.
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
    },
    logger: {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
    },
    db: { drizzle: { execute: async () => ({ rows: [{ id: "claimed" }] }) } },
  };

  return { payload, updates, creates, emails };
}

const topupClient = { isSandbox: true } as never;

describe("gift card fulfilment", () => {
  it("buys once and stores the code, PIN, URL and instructions", async () => {
    const { payload, updates, creates } = fakePayload([winnerWithPrize()]);
    const client = fakeGiftCardClient();

    const summary = await fulfilPendingPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(client.orderCalls).toEqual([
      { productId: 7, unitPrice: 5000, customIdentifier: "gift-card:w1" },
    ]);

    expect(updates.some((u) => u.data.giftCardTransactionId === "42")).toBe(
      true
    );

    const winnerUpdate = updates.find((u) => u.data.giftCardCode);
    expect(winnerUpdate).toBeDefined();
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
      outcome: "sent",
      providerReference: "gift-card:w1",
      providerTransactionId: "42",
      operatorName: "Amazon Nigeria",
      localAmount: 4900,
    });

    expect(summary).toEqual({ attempted: 1, sent: 1, failed: 0, skipped: 0 });
  });

  it("requeues a failed code fetch and resumes without ordering again", async () => {
    const { payload, updates } = fakePayload([winnerWithPrize()]);
    const codeError = new ReloadlyError("upstream unavailable", 503, {}, true);
    const firstClient = fakeGiftCardClient({ codeError });

    const first = await fulfilPendingPrizes(payload as never, {
      client: topupClient,
      giftCardClient: firstClient as never,
    });

    expect(updates.some((u) => u.data.giftCardTransactionId === "42")).toBe(
      true
    );
    expect(updates.some((u) => u.data.fulfilmentStatus === "pending")).toBe(
      true
    );
    expect(updates.some((u) => u.data.fulfilmentStatus === "fulfilled")).toBe(
      false
    );
    expect(firstClient.orderCalls).toHaveLength(1);
    expect(first).toEqual({ attempted: 1, sent: 0, failed: 1, skipped: 0 });

    const secondClient = fakeGiftCardClient();
    const second = await fulfilPendingPrizes(payload as never, {
      client: topupClient,
      giftCardClient: secondClient as never,
    });

    expect(secondClient.orderCalls).toHaveLength(0);
    expect(secondClient.getTransactionCalls).toEqual(["42"]);
    expect(secondClient.getCodeCalls).toEqual([42]);
    expect(updates.some((u) => u.data.fulfilmentStatus === "fulfilled")).toBe(
      true
    );
    expect(second).toEqual({ attempted: 1, sent: 1, failed: 0, skipped: 0 });
  });

  it("resolves a duplicate identifier to the existing transaction", async () => {
    const { payload, updates } = fakePayload([winnerWithPrize()]);
    const existing = {
      transactionId: 41,
      status: "SUCCESSFUL",
      currencyCode: "NGN",
      amount: 4800,
      product: successfulOrder.product,
    };
    const client = fakeGiftCardClient({
      orderError: new ReloadlyError(
        "Custom identifier provided has already been used",
        400,
        {},
        false
      ),
      findTransaction: () => existing,
    });

    const summary = await fulfilPendingPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(client.orderCalls).toHaveLength(1);
    expect(client.findCalls).toEqual(["gift-card:w1"]);
    expect(client.getCodeCalls).toEqual([41]);
    expect(updates.some((u) => u.data.giftCardTransactionId === "41")).toBe(
      true
    );
    const winnerUpdate = updates.find((u) => u.data.giftCardCode);
    expect(winnerUpdate?.data).toMatchObject({
      giftCardCode: "CARD-1",
      fulfilmentStatus: "fulfilled",
    });
    expect(summary).toEqual({ attempted: 1, sent: 1, failed: 0, skipped: 0 });
  });

  it("skips a legacy gift card with no product, without updating or notifying", async () => {
    const legacy = winnerWithPrize({
      prize: { id: "p1", fulfilmentType: "gift_card" },
    });
    const { payload, updates, creates, emails } = fakePayload([legacy]);
    const client = fakeGiftCardClient();

    const summary = await fulfilPendingPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(summary).toEqual({ attempted: 0, sent: 0, failed: 0, skipped: 0 });
    expect(updates).toHaveLength(0);
    expect(creates).toHaveLength(0);
    expect(emails).toHaveLength(0);
    expect(client.orderCalls).toHaveLength(0);
  });

  it("holds when the product is missing in the current environment", async () => {
    const { payload, updates } = fakePayload([winnerWithPrize()]);
    const client = fakeGiftCardClient({
      productError: new ReloadlyError(
        "Gift Card product not found",
        404,
        {},
        false
      ),
    });

    const summary = await fulfilPendingPrizes(payload as never, {
      client: topupClient,
      giftCardClient: client as never,
    });

    expect(client.getProductCalls).toEqual([7]);
    expect(client.orderCalls).toHaveLength(0);
    expect(updates.some((u) => u.data.fulfilmentStatus === "on_hold")).toBe(
      true
    );
    expect(updates.some((u) => u.data.giftCardCode)).toBe(false);
    expect(summary).toEqual({ attempted: 1, sent: 0, failed: 0, skipped: 1 });
  });
});
