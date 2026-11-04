import { describe, expect, it } from "vitest";
import { ReloadlyError } from "../reloadly";
import { ReloadlyGiftCardClient } from "../reloadlyGiftCards";

type FakeResponse = unknown | { status: number; body: unknown };

function respondingFetch(responses: FakeResponse[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const entry = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const envelope =
      entry !== null &&
      typeof entry === "object" &&
      "status" in entry &&
      "body" in entry
        ? (entry as { status: number; body: unknown })
        : null;
    return new Response(JSON.stringify(envelope ? envelope.body : entry), {
      status: envelope?.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function client(
  responses: FakeResponse[],
  env: "sandbox" | "live" = "sandbox"
) {
  const { calls, fetchImpl } = respondingFetch(responses);
  return {
    calls,
    client: new ReloadlyGiftCardClient({
      clientId: "id",
      clientSecret: "secret",
      env,
      fetchImpl,
    }),
  };
}

const product = {
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

describe("ReloadlyGiftCardClient", () => {
  it("mints a token for the gift card host, not the top-ups host", async () => {
    const { calls, client: gc } = client([
      { access_token: "tok", expires_in: 3600 },
      { content: [product] },
    ]);
    const products = await gc.listProducts({ productName: "Amazon" });

    expect(calls[0]?.url).toBe("https://auth.reloadly.com/oauth/token");
    expect(JSON.parse(String(calls[0]?.init.body)).audience).toBe(
      "https://giftcards-sandbox.reloadly.com"
    );
    expect(calls[1]?.url).toContain("giftcards-sandbox.reloadly.com");
    expect(products).toEqual([product]);
  });

  it("normalises the singular redemption-instruction field", async () => {
    const { client: gc } = client([
      { access_token: "tok", expires_in: 3600 },
      {
        ...product,
        redeemInstructions: undefined,
        redeemInstruction: { concise: "Use at checkout" },
      },
    ]);

    const fetched = await gc.getProduct(7);

    expect(fetched.redeemInstructions).toEqual({ concise: "Use at checkout" });
  });

  it("orders one card in the recipient currency with a per-winner identifier", async () => {
    const { calls, client: gc } = client([
      { access_token: "tok", expires_in: 3600 },
      { transactionId: 42, status: "SUCCESSFUL", currencyCode: "NGN", product },
    ]);
    const order = await gc.order({
      productId: 7,
      unitPrice: 5000,
      customIdentifier: "gift-card:w1",
    });

    const body = JSON.parse(String(calls[1]?.init.body));
    expect(calls[1]?.url).toBe("https://giftcards-sandbox.reloadly.com/orders");
    expect(body).toEqual({
      productId: 7,
      quantity: 1,
      unitPrice: 5000,
      customIdentifier: "gift-card:w1",
      senderName: "News Spend",
    });
    expect(order.transactionId).toBe(42);
  });

  it("fetches the code with the v2 Accept header", async () => {
    const { calls, client: gc } = client([
      { access_token: "tok", expires_in: 3600 },
      {
        cardNumber: "CARD-1",
        pinCode: "1234",
        redemptionUrl: "https://redeem",
      },
    ]);
    const code = await gc.getCode(42);

    const headers = calls[1]?.init.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/com.reloadly.giftcards-v2+json");
    expect(code.cardNumber).toBe("CARD-1");
  });

  it("finds the existing transaction for a duplicate identifier", async () => {
    const { calls, client: gc } = client([
      { access_token: "tok", expires_in: 3600 },
      {
        content: [
          {
            transactionId: 41,
            status: "SUCCESSFUL",
            currencyCode: "NGN",
            customIdentifier: "gift-card:w2",
            product,
          },
          {
            transactionId: 42,
            status: "SUCCESSFUL",
            currencyCode: "NGN",
            customIdentifier: "gift-card:w1",
            product,
          },
        ],
      },
    ]);
    const tx = await gc.findTransaction("gift-card:w1");

    expect(calls[1]?.url).toContain(
      "/reports/transactions?customIdentifier=gift-card%3Aw1"
    );
    expect(tx?.transactionId).toBe(42);
  });

  it("marks Reloadly's duplicate-identifier rejection as already sent", async () => {
    const { client: gc } = client([
      { access_token: "tok", expires_in: 3600 },
      {
        status: 400,
        body: { message: "Custom identifier provided has already been used" },
      },
    ]);
    const error = await gc
      .order({
        productId: 7,
        unitPrice: 5000,
        customIdentifier: "gift-card:w1",
      })
      .catch((err) => err);

    expect(error).toBeInstanceOf(ReloadlyError);
    expect((error as ReloadlyError).isAlreadySent).toBe(true);
  });

  it("treats a missing transaction report as no transaction", async () => {
    const { client: gc } = client([
      { access_token: "tok", expires_in: 3600 },
      { status: 404, body: { message: "Not found" } },
    ]);

    await expect(gc.findTransaction("gift-card:w1")).resolves.toBeNull();
  });
});
