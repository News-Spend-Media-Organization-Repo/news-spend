import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createHmac } from "node:crypto";
import type { BasePayload } from "payload";

import { reloadlyWebhookHandler } from "../src/router/giveaway/webhook";
import { createFakePayload } from "../src/test-utils";

/**
 * Reloadly's callback endpoint (spec 18).
 *
 * Status codes here are a retry protocol, not commentary: Reloadly redelivers
 * anything that is not 2xx, so 2xx is for everything already dealt with
 * (including "not ours"), only a failed signature is 401, only body text that
 * is not JSON is 400, and only a fault on our side is 5xx. The request helper
 * signs the body the documented way — HMAC-SHA256, hex, over
 * `rawBody + ":" + timestamp`.
 */

const SECRET = "whsec_test";
const ENDPOINT = "http://x/api/giveaway/reloadly";
const CALLBACK_TYPE = "airtime_transaction.status";

function callbackBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: CALLBACK_TYPE,
    liveMode: true,
    data: {
      status: "SUCCESSFUL",
      transaction: { transactionId: "33017710", customIdentifier: "w1:1" },
    },
    ...overrides,
  };
}

function request({
  body = callbackBody(),
  raw,
  timestamp = String(Math.floor(Date.now() / 1000)),
  secret = SECRET,
  signature,
  method = "POST",
}: {
  body?: unknown;
  raw?: string;
  timestamp?: string;
  secret?: string;
  signature?: string;
  method?: string;
} = {}) {
  const rawBody = raw ?? JSON.stringify(body);
  const sig =
    signature ??
    createHmac("sha256", secret)
      .update(`${rawBody}:${timestamp}`, "utf-8")
      .digest("hex");

  return new Request(ENDPOINT, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-reloadly-signature": sig,
      "x-reloadly-request-timestamp": timestamp,
    },
    ...(method === "POST" ? { body: rawBody } : {}),
  });
}

const saved = process.env.RELOADLY_WEBHOOK_SECRET;

beforeEach(() => {
  process.env.RELOADLY_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  if (saved === undefined) {
    delete process.env.RELOADLY_WEBHOOK_SECRET;
  } else {
    process.env.RELOADLY_WEBHOOK_SECRET = saved;
  }
});

describe("reloadlyWebhookHandler", () => {
  it("answers 503 when the secret is not configured", async () => {
    delete process.env.RELOADLY_WEBHOOK_SECRET;

    const response = await reloadlyWebhookHandler(request());

    // Not 200: accepting it would be pretending we could have verified it.
    expect(response.status).toBe(503);
  });

  it("refuses anything but POST", async () => {
    const response = await reloadlyWebhookHandler(request({ method: "GET" }));

    expect(response.status).toBe(405);
  });

  it("rejects invalid JSON with 400", async () => {
    // Signed body text that is not JSON: rejected before the signature, so it
    // is a 400 rather than the 401 a forged body would get.
    const response = await reloadlyWebhookHandler(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects a forged signature with 401", async () => {
    const response = await reloadlyWebhookHandler(
      request({ signature: "a".repeat(64) })
    );

    expect(response.status).toBe(401);
  });

  it("rejects a body tampered with after signing", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", SECRET)
      .update(`${JSON.stringify(callbackBody())}:${timestamp}`, "utf-8")
      .digest("hex");

    const response = await reloadlyWebhookHandler(
      request({
        body: callbackBody({ data: { status: "FAILED" } }),
        timestamp,
        signature,
      })
    );

    expect(response.status).toBe(401);
  });

  it("does no database work for an unsigned request", async () => {
    const payload = createFakePayload();

    const response = await reloadlyWebhookHandler(
      request({ signature: "b".repeat(64) }),
      payload as unknown as BasePayload
    );

    expect(response.status).toBe(401);
    // Resolving the payload instance is what opens a database connection. A
    // forged request must not get that far, so the fake records zero calls.
    expect(payload.calls).toHaveLength(0);
  });

  it("records why a signature was rejected", async () => {
    const warn = spyOn(console, "warn");

    try {
      const response = await reloadlyWebhookHandler(
        request({ signature: "c".repeat(64) })
      );

      expect(response.status).toBe(401);
      const logged = warn.mock.calls.at(-1) as unknown[] | undefined;
      expect(logged?.[0]).toBe("[giveaway] Reloadly callback rejected");
      expect((logged?.[1] as { reason?: string })?.reason).toBeTruthy();
    } finally {
      warn.mockRestore();
    }
  });

  it("acknowledges a signed payload it cannot recognise", async () => {
    const payload = createFakePayload();

    const response = await reloadlyWebhookHandler(
      request({ body: { id: 2, type: "some.other.event" } }),
      payload as unknown as BasePayload
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Nothing to do",
      acknowledged: true,
    });
  });

  it("acknowledges a callback it cannot match", async () => {
    const payload = createFakePayload();

    const response = await reloadlyWebhookHandler(
      request(),
      payload as unknown as BasePayload
    );

    // A genuine callback for a transaction we do not have: retrying cannot fix
    // that, so it is acknowledged rather than left to redeliver.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: "ignored",
    });
  });

  it("logs the raw payload once the signature is valid", async () => {
    const payload = createFakePayload();
    const logged: unknown[][] = [];
    payload.logger.info = (...args: unknown[]): undefined => {
      logged.push(args);
    };

    const rawBody = JSON.stringify(callbackBody());
    const response = await reloadlyWebhookHandler(
      request({ raw: rawBody }),
      payload as unknown as BasePayload
    );

    expect(response.status).toBe(200);
    // The first live callback is what confirms Reloadly's mapping; it is only
    // recoverable if the verified bytes are logged whole.
    expect(
      logged.some(
        ([meta, message]) =>
          (meta as { rawBody?: string })?.rawBody === rawBody &&
          message === "[giveaway] Reloadly callback"
      )
    ).toBe(true);
  });

  it("answers 500 when the verdict cannot be applied", async () => {
    const payload = createFakePayload();
    payload.find = () => Promise.reject(new Error("database is unreachable"));

    const response = await reloadlyWebhookHandler(
      request(),
      payload as unknown as BasePayload
    );

    // A real fault on our side: 5xx so Reloadly retries rather than dropping a
    // verdict a winner is waiting on.
    expect(response.status).toBe(500);
  });
});
