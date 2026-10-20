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
const { isUniqueViolation } = await import("./survey/providerPoints");
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
const theoremHash = (query: Record<string, string>) =>
  crypto
    .createHmac("sha1", "theorem-secret")
    .update(`/survey/theorem/postback?${new URLSearchParams(query)}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

/** A postback signed the way TheoremReach signs it. */
const theorem = (
  payload: Fake,
  fields: { reward: number; user_id: string; tx_id: string; reversal?: string },
  options: { sign?: boolean } = {}
) => {
  const query: Record<string, string> = {
    reward: String(fields.reward),
    user_id: fields.user_id,
    tx_id: fields.tx_id,
    ...(fields.reversal ? { reversal: fields.reversal } : {}),
  };
  return call(
    surveyRouter.theoremPostback,
    {
      ...fields,
      ...(options.sign === false ? {} : { hash: theoremHash(query) }),
    } as never,
    { context: ctx(payload) }
  );
};

describe("TheoremReach postback", () => {
  it("records the provider reference that makes the award unique", async () => {
    const payload = freshPayload();

    await theorem(payload, { reward: 100, user_id: "user-1", tx_id: "t1" });

    expect(payload.docs("activities")[0]?.providerRef).toBe("theorem:t1:award");
  });

  it("recognises a database unique violation through a wrapped error", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(new Error("database down"))).toBe(false);
  });

  it("rejects a request that carries no hash, and pays nothing", async () => {
    const payload = freshPayload();

    const res = await theorem(
      payload,
      { reward: 250_000, user_id: "user-1", tx_id: "made-up" },
      { sign: false }
    );

    expect(res).toEqual({ error: "Invalid hash" });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("rejects a wrong hash", async () => {
    const payload = freshPayload();

    const res = await call(
      surveyRouter.theoremPostback,
      { reward: 100, user_id: "user-1", tx_id: "t1", hash: "nope" } as never,
      { context: ctx(payload) }
    );

    expect(res).toEqual({ error: "Invalid hash" });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("pays a correctly signed completion and records which transaction it was", async () => {
    const payload = freshPayload();

    await theorem(payload, { reward: 100, user_id: "user-1", tx_id: "t1" });

    expect(payload.docs("activities")).toHaveLength(1);
    expect(payload.docs("activities")[0]).toMatchObject({
      point: 100,
      action: "surveyTask",
      user: "user-1",
      metadata: { provider: "theorem", transactionId: "t1", kind: "award" },
    });
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
