import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";

import { createFakePayload } from "../../test-utils";
import { applyEvent, showsWebhookHandler } from "./webhook";

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
    data: { reference: "ref_1", amountMinor: 850_000 },
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
    let applied = 0;
    const response = await showsWebhookHandler(
      request({ method: "GET" }),
      () => {
        applied += 1;
        return "ignored";
      }
    );

    expect(response.status).toBe(405);
    expect(applied).toBe(0);
  });

  it("rejects a forged signature with 401 before applying anything", async () => {
    let applied = 0;
    const response = await showsWebhookHandler(
      request({ signature: `v1=${"a".repeat(64)}` }),
      () => {
        applied += 1;
        return "ignored";
      }
    );

    expect(response.status).toBe(401);
    expect(applied).toBe(0);
  });

  it("rejects a missing signature with 401 before applying anything", async () => {
    let applied = 0;
    const response = await showsWebhookHandler(
      request({ signature: null }),
      () => {
        applied += 1;
        return "ignored";
      }
    );

    expect(response.status).toBe(401);
    expect(applied).toBe(0);
  });

  it("answers 401 for a signed body with the wrong secret", async () => {
    let applied = 0;
    const response = await showsWebhookHandler(
      request({
        signature: sign(JSON.stringify(envelope()), currentTimestamp(), "no"),
      }),
      () => {
        applied += 1;
        return "ignored";
      }
    );

    expect(response.status).toBe(401);
    expect(applied).toBe(0);
  });

  it("asks for a retry on a stale but genuine signature", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    let applied = 0;
    const response = await showsWebhookHandler(request({ timestamp }), () => {
      applied += 1;
      return "ignored";
    });

    expect(response.status).toBe(503);
    expect(applied).toBe(0);
  });

  it("rejects an oversized body with 413 before verifying", async () => {
    const raw = JSON.stringify(
      envelope({ data: { pad: "x".repeat(1024 * 1024) } })
    );
    let applied = 0;
    const response = await showsWebhookHandler(request({ raw }), () => {
      applied += 1;
      return "ignored";
    });

    expect(response.status).toBe(413);
    expect(applied).toBe(0);
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

  it("asks for a retry when the effect cannot be applied yet", async () => {
    const response = await showsWebhookHandler(request(), () => "failed");

    expect(response.status).toBe(503);
  });

  it("answers 500 when the effect fails", async () => {
    const original = console.error;
    console.error = () => undefined;

    try {
      const response = await showsWebhookHandler(request(), () => {
        throw new Error("database is unreachable");
      });

      expect(response.status).toBe(500);
    } finally {
      console.error = original;
    }
  });

  it("applies a paid order transition and awards points", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          {
            id: "order-1",
            user: "user-1",
            reference: "ref_1",
            state: "pending",
            eventId: "event-1",
            eventName: "Lagos Live",
            amountMinor: 850_000,
            refundedMinor: 0,
            pointsAwarded: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });

    const result = await applyEvent(
      envelope({
        data: {
          purchase: "ref_1",
          amount_minor: 850_000,
          state: "paid",
          order_version: "1",
        },
      }) as never,
      payload as never
    );

    expect(result).toBe("applied");
    expect(
      payload.docs("activities").filter((row) => row.action === "eventTicket")
    ).toHaveLength(1);
  });

  it("asks for a retry when a paid reference cannot be resolved", async () => {
    const payload = createFakePayload();

    const result = await applyEvent(
      envelope({
        data: { purchase: "ref_unknown", amount_minor: 850_000, state: "paid" },
      }) as never,
      payload as never
    );

    expect(result).toBe("failed");
  });

  it("refuses to act on a paid event with no reference or amount", async () => {
    const payload = createFakePayload();

    await expect(
      applyEvent(
        envelope({ data: { state: "paid" } }) as never,
        payload as never
      )
    ).resolves.toBe("failed");
  });

  it("expires only pending orders", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          {
            id: "order-1",
            user: "user-1",
            reference: "ref_1",
            state: "paid",
            amountMinor: 850_000,
            refundedMinor: 0,
            pointsAwarded: 0,
          },
        ],
      },
    });

    const result = await applyEvent(
      envelope({
        type: "purchase.expired",
        data: { purchase: "ref_1" },
      }) as never,
      payload as never
    );

    expect(result).toBe("ignored");
    expect(payload.docs("ticket-orders")[0]?.state).toBe("paid");
  });

  it("cancels an event's paid orders without reversing points", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          {
            id: "order-1",
            user: "user-1",
            reference: "ref_1",
            state: "paid",
            eventId: "event-1",
            eventName: "Lagos Live",
            amountMinor: 850_000,
            refundedMinor: 0,
            pointsAwarded: 250,
            pointsReversed: 0,
          },
          {
            id: "order-2",
            user: "user-2",
            reference: "ref_2",
            state: "paid",
            eventId: "event-2",
            amountMinor: 100_000,
            pointsAwarded: 50,
            refundedMinor: 0,
          },
        ],
        activities: [
          {
            id: "activity-1",
            user: "user-1",
            action: "eventTicket",
            point: 250,
          },
        ],
      },
    });

    const result = await applyEvent(
      envelope({
        type: "event.cancelled",
        aggregate: { type: "event", id: "event-1", version: 2 },
        data: { event_id: "event-1" },
      }) as never,
      payload as never
    );

    expect(result).toBe("applied");
    expect(payload.docs("ticket-orders")[0]?.state).toBe("cancelled");
    expect(payload.docs("ticket-orders")[1]?.state).toBe("paid");
    expect(payload.docs("ticket-orders")[0]?.pointsReversed).toBe(0);
    expect(
      payload.docs("activities").filter((row) => row.action === "pointReversal")
    ).toHaveLength(0);
  });

  it("records and reverses a refund", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          {
            id: "order-1",
            user: "user-1",
            reference: "ref_1",
            state: "paid",
            eventId: "event-1",
            eventName: "Lagos Live",
            amountMinor: 850_000,
            refundedMinor: 0,
            pointsAwarded: 250,
            pointsReversed: 0,
          },
        ],
      },
    });

    const refund = envelope({
      type: "refund.updated",
      aggregate: { type: "refund", id: "refund-1", version: 1 },
      data: { purchase: "ref_1", amount_minor: 425_000, refund_id: "refund-1" },
    });

    await expect(applyEvent(refund as never, payload as never)).resolves.toBe(
      "applied"
    );
    await expect(applyEvent(refund as never, payload as never)).resolves.toBe(
      "ignored"
    );

    expect(payload.docs("ticket-orders")[0]?.refundedMinor).toBe(425_000);
    expect(payload.docs("ticket-orders")[0]?.pointsReversed).toBe(125);
    expect(
      payload.docs("activities").filter((row) => row.action === "pointReversal")
    ).toHaveLength(1);
  });

  it("ignores inventory events", async () => {
    const payload = createFakePayload();

    await expect(
      applyEvent(
        envelope({ type: "inventory.sold_out" }) as never,
        payload as never
      )
    ).resolves.toBe("ignored");
  });

  it("logs only the event id and type", async () => {
    const original = console.info;
    const calls: unknown[][] = [];
    console.info = (...args: unknown[]) => {
      calls.push(args);
    };
    const raw = JSON.stringify(envelope());
    const signature = sign(raw);

    try {
      const response = await showsWebhookHandler(
        request({ raw, signature }),
        () => "ignored"
      );

      expect(response.status).toBe(200);
      const meta = calls.at(-1)?.[1] as Record<string, unknown> | undefined;
      expect(Object.keys(meta ?? {}).sort()).toEqual(["id", "type"]);
      // The body and the signature must never reach a log line.
      for (const call of calls) {
        const serialized = JSON.stringify(call);
        expect(serialized).not.toContain(raw);
        expect(serialized).not.toContain(signature);
      }
    } finally {
      console.info = original;
    }
  });
});
