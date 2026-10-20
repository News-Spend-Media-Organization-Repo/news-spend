import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import crypto from "node:crypto";
import { call } from "@orpc/server";

// The provider keys, set for this file only and put back afterwards so other
// test files still see the providers as unconfigured.
const KEYS = {
  CPX_SECURE_HASH: "cpx-secret",
  RAPIDO_API_KEY: "rapido-key",
  RAPIDO_SECURE_HASH: "rapido-secret",
  THEOREM_API_KEY: "theorem-secret",
};
const saved = Object.fromEntries(
  Object.keys(KEYS).map((key) => [key, process.env[key]])
);

const notificationMock = mock(async () => ({}));
mock.module("@news-spend-media/payload/lib/send-notification", () => ({
  sendNotification: notificationMock,
}));

const { createFakePayload, expectError, mockContext } = await import(
  "../test-utils"
);
const { surveyRouter } = await import("./survey");
const { signTheoremUrl } = await import("./survey/offers/postbacks");
const { MAX_SURVEY_POINTS } = await import(
  "@news-spend-media/payload/lib/surveyPoints"
);

type Fake = ReturnType<typeof createFakePayload>;

const freshPayload = (): Fake =>
  createFakePayload({
    collections: {
      users: [{ id: "user-1" }, { id: "user-2" }],
      "push-tokens": [],
    },
  });

const ctx = (payload: Fake) => mockContext({ payload });

beforeAll(() => {
  Object.assign(process.env, KEYS);
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

beforeEach(() => {
  notificationMock.mockClear();
});

// ---------------------------------------------------------------------------
// TheoremReach
// ---------------------------------------------------------------------------
const THEOREM_PATH = "/api/survey/theorem/postback";
const THEOREM_BASE = `https://api.newsspend.com${THEOREM_PATH}`;

const signTheorem = (url: string) => signTheoremUrl("theorem-secret", url);

/**
 * Calls the postback with the URL TheoremReach would have called. `fields` are
 * also used as the parsed input, as oRPC would hand them to the handler.
 */
const theorem = (
  payload: Fake,
  fields: Record<string, string | number>,
  options: {
    at?: "first" | "middle" | "last" | "only";
    hash?: "valid" | "wrong" | "none";
    /** Query string to sign, when it differs from `fields`. */
    query?: string;
    /** URL to sign, when it differs from the request URL. */
    signedUrl?: string;
    /** URL actually received, hash included. */
    requestUrl?: string;
    headers?: Record<string, string>;
  } = {}
) => {
  const query =
    options.query ??
    Object.entries(fields)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("&");
  const signedUrl = options.signedUrl ?? `${THEOREM_BASE}?${query}`;
  const signature = options.hash === "wrong" ? "wrong" : signTheorem(signedUrl);

  const [pathname = THEOREM_BASE, rawQuery = ""] = signedUrl.split("?");
  const parts = rawQuery ? rawQuery.split("&") : [];
  const hashPart = `hash=${signature}`;

  if (options.hash !== "none") {
    switch (options.at ?? "last") {
      case "first":
        parts.unshift(hashPart);
        break;
      case "middle":
        parts.splice(Math.floor(parts.length / 2), 0, hashPart);
        break;
      case "only":
        parts.splice(0, parts.length, hashPart);
        break;
      default:
        parts.push(hashPart);
    }
  }

  const requestUrl =
    options.requestUrl ??
    (parts.length > 0 ? `${pathname}?${parts.join("&")}` : pathname);

  return call(
    surveyRouter.theoremPostback,
    {
      ...fields,
      ...(options.hash === "none" ? {} : { hash: signature }),
    } as never,
    {
      context: mockContext({
        payload,
        request: new Request(requestUrl, { headers: options.headers }),
      }),
    }
  );
};

describe("TheoremReach postback", () => {
  it("matches Theorem's published signature example", () => {
    expect(
      signTheoremUrl(
        "ZZ6VkORqV25iSWOVb5cwZ03zpns",
        "https://www.abc.com/ex.aspx?abc=def&vid=123"
      )
    ).toBe("VNBMolYjJug6cDQqOX4oddfteDw");
  });

  it("pays a signed callback whatever the parameter order or encoding", async () => {
    const payload = freshPayload();

    const fields = {
      user_id: "user-1",
      reward: 100,
      tx_id: "t1",
      offer_name: "Opinions on news",
      currency: 1.5,
    };

    await theorem(payload, fields, {
      // Outside our schema's order, with `+`, `%20` and a decimal.
      query:
        "user_id=user-1&reward=100&tx_id=t1&offer_name=Opinions+on%20news&currency=1.50",
    });

    expect(payload.docs("activities")).toHaveLength(1);
    expect(payload.docs("activities")[0]).toMatchObject({
      point: 100,
      action: "surveyTask",
      user: "user-1",
      metadata: { provider: "theorem", transactionId: "t1", kind: "award" },
    });
  });

  for (const at of ["first", "middle", "last"] as const) {
    it(`finds and removes the hash when it is ${at}`, async () => {
      const payload = freshPayload();

      const res = await theorem(
        payload,
        { reward: 100, user_id: "user-1", tx_id: `t-${at}` },
        { at }
      );

      expect(res).toEqual({ success: true });
      expect(payload.docs("activities")).toHaveLength(1);
    });
  }

  it("accepts a hash that is the only parameter when it signs the bare URL", async () => {
    const payload = freshPayload();

    const res = await theorem(
      payload,
      { reward: 100, user_id: "user-1", tx_id: "t1" },
      { signedUrl: THEOREM_BASE, at: "only" }
    );

    expect(res).toEqual({ success: true });
    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("rejects a hash that is alone in a query it did not sign", async () => {
    const payload = freshPayload();

    const res = await theorem(
      payload,
      { reward: 100, user_id: "user-1", tx_id: "t1" },
      { at: "only" }
    );

    expect(res).toEqual({ error: "Invalid hash" });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects a request that carries no hash, and pays nothing", async () => {
    const payload = freshPayload();

    const res = await theorem(
      payload,
      { reward: 250_000, user_id: "user-1", tx_id: "made-up" },
      { hash: "none" }
    );

    expect(res).toEqual({ error: "Invalid hash" });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects a wrong hash", async () => {
    const payload = freshPayload();

    const res = await theorem(
      payload,
      { reward: 100, user_id: "user-1", tx_id: "t1" },
      { hash: "wrong" }
    );

    expect(res).toEqual({ error: "Invalid hash" });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects a hash made for a different reward", async () => {
    const payload = freshPayload();

    const signedUrl = `${THEOREM_BASE}?user_id=user-1&reward=100&tx_id=t1`;
    const hash = signTheorem(signedUrl);
    const res = await theorem(
      payload,
      { reward: 999, user_id: "user-1", tx_id: "t1" },
      {
        signedUrl,
        requestUrl: `${THEOREM_BASE}?user_id=user-1&reward=999&tx_id=t1&hash=${hash}`,
      }
    );

    expect(res).toEqual({ error: "Invalid hash" });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects a tampered parameter under a valid hash", async () => {
    const payload = freshPayload();

    const signedUrl = `${THEOREM_BASE}?user_id=user-1&reward=100&tx_id=t1`;
    const hash = signTheorem(signedUrl);
    const res = await theorem(
      payload,
      { reward: 100, user_id: "user-1", tx_id: "t1" },
      {
        signedUrl,
        requestUrl: `${THEOREM_BASE}?user_id=user-2&reward=100&tx_id=t1&hash=${hash}`,
      }
    );

    expect(res).toEqual({ error: "Invalid hash" });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("uses Railway's public domain when the request host is internal", async () => {
    const payload = freshPayload();
    process.env.RAILWAY_PUBLIC_DOMAIN = "api.newsspend.com";

    try {
      const query = "user_id=user-1&reward=100&tx_id=t1";
      const hash = signTheorem(`${THEOREM_BASE}?${query}`);
      const res = await theorem(
        payload,
        { reward: 100, user_id: "user-1", tx_id: "t1" },
        {
          signedUrl: `${THEOREM_BASE}?${query}`,
          requestUrl: `http://internal:8080${THEOREM_PATH}?${query}&hash=${hash}`,
        }
      );

      expect(res).toEqual({ success: true });
      expect(payload.docs("activities")).toHaveLength(1);
    } finally {
      delete process.env.RAILWAY_PUBLIC_DOMAIN;
    }
  });

  it("signs the request's own origin when it is already public", async () => {
    const payload = freshPayload();

    // The default tests do exactly this: the Request carries the public URL
    // and there is no forwarded host or Railway variable.
    const res = await theorem(payload, {
      reward: 100,
      user_id: "user-1",
      tx_id: "t1",
    });

    expect(res).toEqual({ success: true });
  });

  it("falls back to the forwarded headers without the env var", async () => {
    const payload = freshPayload();

    const query = "user_id=user-1&reward=100&tx_id=t1";
    const hash = signTheorem(`${THEOREM_BASE}?${query}`);
    const res = await theorem(
      payload,
      { reward: 100, user_id: "user-1", tx_id: "t1" },
      {
        signedUrl: `${THEOREM_BASE}?${query}`,
        requestUrl: `http://internal:8080${THEOREM_PATH}?${query}&hash=${hash}`,
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "api.newsspend.com",
        },
      }
    );

    expect(res).toEqual({ success: true });
    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("answers a debug callback and never credits it, signed or not", async () => {
    const signed = freshPayload();
    const signedRes = await theorem(signed, {
      debug: "true",
      reward: 100,
      user_id: "user-1",
    });
    expect(signedRes).toEqual({ success: true });
    expect(signed.docs("activities")).toHaveLength(0);

    const unsigned = freshPayload();
    const unsignedRes = await theorem(
      unsigned,
      { debug: "true" },
      { hash: "none" }
    );
    expect(unsignedRes).toEqual({ success: true });
    expect(unsigned.docs("activities")).toHaveLength(0);
  });

  it("accepts the transaction id as transaction_id", async () => {
    const payload = freshPayload();

    await theorem(payload, {
      reward: 100,
      user_id: "user-1",
      transaction_id: "t2",
    });

    expect(payload.docs("activities")[0]).toMatchObject({
      metadata: { provider: "theorem", transactionId: "t2", kind: "award" },
    });
  });

  it("refuses a crediting callback with no transaction id and writes nothing", async () => {
    const payload = freshPayload();

    const res = await theorem(payload, { reward: 100, user_id: "user-1" });

    expect(res).toEqual({ error: "Missing required parameters" });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("refuses a crediting callback with no user and writes nothing", async () => {
    const payload = freshPayload();

    const res = await theorem(payload, { reward: 100, tx_id: "t1" });

    expect(res).toEqual({ error: "Missing required parameters" });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("logs parameter names, never the hash, when a callback is refused", async () => {
    const payload = freshPayload();
    const errorLog = spyOn(console, "error").mockImplementation(
      () => undefined
    );

    await theorem(payload, { reward: 100, user_id: "user-1" });
    const logged = JSON.stringify(errorLog.mock.calls);
    errorLog.mockRestore();

    expect(logged).toContain("tx_id");
    expect(logged).not.toContain(signTheorem(`${THEOREM_BASE}`));
  });

  it("pays a repeated transaction once, even when it arrives many times at once", async () => {
    const payload = freshPayload();

    await Promise.all(
      Array.from({ length: 6 }, () =>
        theorem(payload, { reward: 100, user_id: "user-1", tx_id: "t1" })
      )
    );
    await theorem(payload, { reward: 100, user_id: "user-1", tx_id: "t1" });

    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("does not pay a different user for a transaction already paid", async () => {
    const payload = freshPayload();

    await theorem(payload, { reward: 100, user_id: "user-1", tx_id: "t1" });
    await theorem(payload, { reward: 100, user_id: "user-2", tx_id: "t1" });

    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("refuses an award above the maximum", async () => {
    const payload = freshPayload();

    const res = await theorem(payload, {
      reward: MAX_SURVEY_POINTS + 1,
      user_id: "user-1",
      tx_id: "big",
    });

    expect(res).toMatchObject({ error: expect.any(String) });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("takes back what a transaction paid when it is reversed, once", async () => {
    const payload = freshPayload();
    await theorem(payload, { reward: 100, user_id: "user-1", tx_id: "t1" });

    await theorem(payload, {
      reward: 100,
      user_id: "user-1",
      tx_id: "t1",
      reversal: "true",
    });
    await theorem(payload, {
      reward: 100,
      user_id: "user-1",
      tx_id: "t1",
      reversal: "true",
    });

    const docs = payload.docs("activities");
    expect(docs).toHaveLength(2);
    expect(docs[1]).toMatchObject({
      point: -100,
      action: "pointReversal",
      user: "user-1",
      metadata: { provider: "theorem", transactionId: "t1", kind: "reversal" },
    });
  });

  it("ignores a reversal of a transaction it never paid", async () => {
    const payload = freshPayload();

    await theorem(payload, {
      reward: 100,
      user_id: "user-1",
      tx_id: "never-paid",
      reversal: "true",
    });

    expect(payload.docs("activities")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RapidoReach
// ---------------------------------------------------------------------------
const rapido = (
  payload: Fake,
  fields: {
    endUserId: string;
    transactionId: string;
    amount: number;
    status?: string;
    hash?: string;
  }
) => {
  const offer = "offer-1";
  return call(
    surveyRouter.rapidoPostback,
    {
      endUserId: fields.endUserId,
      status: fields.status ?? "COMPLETE",
      currencyAmt: fields.amount,
      transactionId: fields.transactionId,
      offerInvitationId: offer,
      offerTitle: "A survey",
      oidHash:
        fields.hash ??
        crypto
          .createHash("md5")
          .update(`${fields.transactionId}:${offer}:rapido-secret`)
          .digest("hex"),
    } as never,
    { context: ctx(payload) }
  );
};

describe("RapidoReach postback", () => {
  it("pays a signed completion and records which transaction it was", async () => {
    const payload = freshPayload();

    const res = await rapido(payload, {
      endUserId: "user-1",
      transactionId: "r1",
      amount: 80,
    });

    expect(res).toEqual({ success: 1 });
    expect(payload.docs("activities")[0]).toMatchObject({
      point: 80,
      metadata: { provider: "rapido", transactionId: "r1", kind: "award" },
    });
  });

  it("rejects a wrong hash", async () => {
    const payload = freshPayload();

    const res = await rapido(payload, {
      endUserId: "user-1",
      transactionId: "r1",
      amount: 80,
      hash: "bad",
    });

    expect(res).toEqual({ success: 0 });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("pays a repeated transaction once, and not to a different user or amount", async () => {
    const payload = freshPayload();

    await rapido(payload, {
      endUserId: "user-1",
      transactionId: "r1",
      amount: 80,
    });
    await rapido(payload, {
      endUserId: "user-1",
      transactionId: "r1",
      amount: 80,
    });
    await rapido(payload, {
      endUserId: "user-2",
      transactionId: "r1",
      amount: 4000,
    });

    expect(payload.docs("activities")).toHaveLength(1);
    expect(payload.docs("activities")[0]).toMatchObject({
      user: "user-1",
      point: 80,
    });
  });

  it("refuses an award above the maximum", async () => {
    const payload = freshPayload();

    const res = await rapido(payload, {
      endUserId: "user-1",
      transactionId: "r2",
      amount: MAX_SURVEY_POINTS + 1,
    });

    expect(res).toEqual({ success: 0 });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("tells RapidoReach it failed when the points could not be saved, so it retries", async () => {
    const payload = freshPayload();
    const original = payload.create;
    payload.create = (() =>
      Promise.reject(new Error("database down"))) as never;

    const res = await rapido(payload, {
      endUserId: "user-1",
      transactionId: "r3",
      amount: 80,
    });
    payload.create = original;

    expect(res).toEqual({ success: 0 });
  });

  it("does not write the hash into the logs", async () => {
    const payload = freshPayload();
    const log = spyOn(console, "log").mockImplementation(() => undefined);

    await rapido(payload, {
      endUserId: "user-1",
      transactionId: "r4",
      amount: 80,
      hash: "super-secret-hash",
    });
    const logged = JSON.stringify(log.mock.calls);
    log.mockRestore();

    expect(logged).not.toContain("super-secret-hash");
  });
});

// ---------------------------------------------------------------------------
// CPX Research
// ---------------------------------------------------------------------------
const cpxHash = (transId: string) =>
  crypto.createHash("md5").update(`${transId}-cpx-secret`).digest("hex");

const cpx = (
  payload: Fake,
  fields: {
    trans_id: string;
    user_id?: string;
    type?: string;
    amount_local?: number;
  }
) =>
  call(
    surveyRouter.cpx.postback,
    {
      status: "1",
      user_id: "user-1",
      type: "complete",
      ...fields,
      secure_hash: cpxHash(fields.trans_id),
    } as never,
    { context: ctx(payload) }
  );

describe("CPX postback", () => {
  it("records which transaction it paid", async () => {
    const payload = freshPayload();

    await cpx(payload, { trans_id: "c1", amount_local: 100 });

    expect(payload.docs("activities")[0]).toMatchObject({
      point: 100,
      metadata: {
        provider: "cpx",
        transactionId: "c1:complete",
        kind: "award",
      },
    });
  });

  it("pays a repeated transaction once, and not to a different user or amount", async () => {
    const payload = freshPayload();

    await cpx(payload, { trans_id: "c1", amount_local: 100 });
    await cpx(payload, { trans_id: "c1", amount_local: 100 });
    await cpx(payload, {
      trans_id: "c1",
      amount_local: 4000,
      user_id: "user-2",
    });

    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("pays a completion and a bonus that share a transaction id separately", async () => {
    const payload = freshPayload();

    await cpx(payload, { trans_id: "c1", amount_local: 100 });
    await cpx(payload, { trans_id: "c1", amount_local: 20, type: "out" });

    expect(payload.docs("activities")).toHaveLength(2);
  });

  it("refuses an award above the maximum", async () => {
    const payload = freshPayload();

    const error = await expectError(
      cpx(payload, { trans_id: "c2", amount_local: MAX_SURVEY_POINTS + 1 })
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("fails the request when the points could not be saved, so CPX retries", async () => {
    const payload = freshPayload();
    payload.create = (() =>
      Promise.reject(new Error("database down"))) as never;

    const error = await expectError(
      cpx(payload, { trans_id: "c3", amount_local: 100 })
    );

    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("reverses only what the transaction paid, once", async () => {
    const payload = freshPayload();
    await cpx(payload, { trans_id: "c4", amount_local: 100 });

    // The reversal claims more than was paid, and arrives twice.
    await cpx(payload, { trans_id: "c4", amount_local: 900, type: "reversal" });
    await cpx(payload, { trans_id: "c4", amount_local: 900, type: "reversal" });

    const docs = payload.docs("activities");
    expect(docs).toHaveLength(2);
    expect(docs[1]).toMatchObject({ point: -100, action: "pointReversal" });
  });

  it("ignores a reversal of a transaction it never paid", async () => {
    const payload = freshPayload();

    await cpx(payload, {
      trans_id: "never",
      amount_local: 500,
      type: "reversal",
    });

    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("does not write the hash into the logs", async () => {
    const payload = freshPayload();
    const log = spyOn(console, "log").mockImplementation(() => undefined);

    await cpx(payload, { trans_id: "c5", amount_local: 100 });
    const logged = JSON.stringify(log.mock.calls);
    log.mockRestore();

    expect(logged).not.toContain(cpxHash("c5"));
  });
});
