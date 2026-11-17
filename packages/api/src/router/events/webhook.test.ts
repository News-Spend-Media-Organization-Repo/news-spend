import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createHmac } from "node:crypto";

import { showsWebhookHandler } from "./webhook";

/**
 * Shows' webhook entrypoint. Status codes are a retry protocol: 2xx for
 * anything we have finished dealing with (including "not something we act
 * on"), 401 only for a bad signature, 405 for the wrong method, 503 when the
 * secret is missing, and 5xx only for a fault on our side.
 *
 * Every request here is signed from a fixed secret and a fixed timestamp, so
 * the window is exercised without sleeping.
 */

const SECRET = "whsec_shows_test";
const KEY_ID = "key_test_1";
const ENDPOINT = "http://x/api/events/shows";

function currentTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "order.transitioned",
    schema_version: "1",
    environment: "sandbox",
    project: "proj_test",
    occurred_at: "2026-11-17T12:00:00.000Z",
    aggregate: { type: "order", id: "ord_1", version: 2 },
    ...overrides,
  };
}

function sign(
  rawBody: string,
  timestamp = currentTimestamp(),
  secret = SECRET
) {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf-8")
    .digest("hex");
  return `v1=${digest}`;
}

function request({
  body = envelope(),
  raw,
  method = "POST",
  timestamp = currentTimestamp(),
  keyId = KEY_ID,
  signature,
}: {
  body?: unknown;
  raw?: string;
  method?: string;
  timestamp?: string;
  keyId?: string | null;
  signature?: string | null;
} = {}): Request {
  const rawBody = raw ?? JSON.stringify(body);
  const result = new Headers({ "Content-Type": "application/json" });
  result.set("Shows-Webhook-Timestamp", timestamp);
  if (keyId !== null) {
    result.set("Shows-Webhook-Key-Id", keyId);
  }
  const value = signature === undefined ? sign(rawBody, timestamp) : signature;
  if (value !== null) {
    result.set("Shows-Webhook-Signature", value);
  }

  return new Request(ENDPOINT, {
    method,
    headers: result,
    ...(method === "POST" ? { body: rawBody } : {}),
  });
}

const savedSecret = process.env.SHOWS_WEBHOOK_SECRET;

beforeEach(() => {
  process.env.SHOWS_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  if (savedSecret === undefined) {
    delete process.env.SHOWS_WEBHOOK_SECRET;
  } else {
    process.env.SHOWS_WEBHOOK_SECRET = savedSecret;
  }
});

describe("showsWebhookHandler", () => {
  it("answers 503 when the secret is not configured", async () => {
    delete process.env.SHOWS_WEBHOOK_SECRET;

    let applied = 0;
    const response = await showsWebhookHandler(request(), () => {
      applied += 1;
      return "ignored";
    });

    expect(response.status).toBe(503);
    expect(applied).toBe(0);
  });

  it("refuses anything but POST", async () => {
    const response = await showsWebhookHandler(request({ method: "GET" }));

    expect(response.status).toBe(405);
  });

  it("rejects a forged signature with 401", async () => {
    const response = await showsWebhookHandler(
      request({ signature: `v1=${"a".repeat(64)}` })
    );

    expect(response.status).toBe(401);
  });

  it("rejects a missing signature with 401", async () => {
    const response = await showsWebhookHandler(request({ signature: null }));

    expect(response.status).toBe(401);
  });

  it("answers 401 for a signed body with the wrong secret", async () => {
    const response = await showsWebhookHandler(
      request({
        signature: sign(JSON.stringify(envelope()), currentTimestamp(), "no"),
      })
    );

    expect(response.status).toBe(401);
  });

  it("acknowledges webhook.test without applying anything", async () => {
    let applied = 0;
    const response = await showsWebhookHandler(
      request({ body: envelope({ type: "webhook.test" }) }),
      () => {
        applied += 1;
        return "ignored";
      }
    );

    expect(response.status).toBe(200);
    expect(applied).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      acknowledged: true,
    });
  });

  it("acknowledges a signed body that is not JSON", async () => {
    // Verification happens on the raw text, before parsing: a correctly signed
    // request whose bytes are not JSON must not throw or be refused as forged.
    let applied = 0;
    const raw = "{not json";

    const response = await showsWebhookHandler(
      request({ raw, signature: sign(raw) }),
      () => {
        applied += 1;
        return "ignored";
      }
    );

    expect(response.status).toBe(200);
    expect(applied).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      acknowledged: true,
    });
  });

  it("acknowledges signed JSON that is not an envelope", async () => {
    let applied = 0;
    const response = await showsWebhookHandler(
      request({ body: [1, 2, 3] }),
      () => {
        applied += 1;
        return "ignored";
      }
    );

    expect(response.status).toBe(200);
    expect(applied).toBe(0);
  });

  it("passes a parsed envelope to the effect seam", async () => {
    const seen: unknown[] = [];
    const response = await showsWebhookHandler(request(), (event) => {
      seen.push(event);
      return "ignored";
    });

    expect(response.status).toBe(200);
    expect(seen).toEqual([envelope()]);
    await expect(response.json()).resolves.toMatchObject({
      result: "ignored",
    });
  });

  it("acknowledges an unknown event type", async () => {
    const response = await showsWebhookHandler(
      request({ body: envelope({ type: "event.something_new" }) }),
      () => "ignored"
    );

    expect(response.status).toBe(200);
  });

  it("answers 500 when the effect fails", async () => {
    const error = spyOn(console, "error");

    try {
      const response = await showsWebhookHandler(request(), () => {
        throw new Error("database is unreachable");
      });

      expect(response.status).toBe(500);
    } finally {
      error.mockRestore();
    }
  });

  it("logs only the event id and type", async () => {
    const info = spyOn(console, "info");
    const raw = JSON.stringify(envelope());
    const signature = sign(raw);

    try {
      const response = await showsWebhookHandler(
        request({ raw, signature }),
        () => "ignored"
      );

      expect(response.status).toBe(200);
      const meta = info.mock.calls.at(-1)?.[1] as
        | Record<string, unknown>
        | undefined;
      expect(Object.keys(meta ?? {}).sort()).toEqual(["id", "type"]);
      // The body and the signature must never reach a log line.
      for (const call of info.mock.calls) {
        const serialized = JSON.stringify(call);
        expect(serialized).not.toContain(raw);
        expect(serialized).not.toContain(signature);
      }
    } finally {
      info.mockRestore();
    }
  });
});
