import { afterEach, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import {
  parseReloadlyCallback,
  reloadlyWebhookSecret,
  verifyReloadlySignature,
} from "@news-spend-media/payload/lib/giveaway/reloadlyWebhook";

const SECRET = "whsec_test";
const BODY = JSON.stringify({ type: "airtime_transaction.status" });
const TYPE = "airtime_transaction.status";

function signed({
  rawBody = BODY,
  timestamp = String(Math.floor(Date.now() / 1000)),
  secret = SECRET,
  signature,
}: {
  rawBody?: string;
  timestamp?: string;
  secret?: string;
  signature?: string;
} = {}) {
  return {
    rawBody,
    timestamp,
    signature:
      signature ??
      createHmac("sha256", secret)
        .update(`${rawBody}:${timestamp}`, "utf-8")
        .digest("hex"),
    secret,
  };
}

describe("verifyReloadlySignature", () => {
  it("accepts a body signed the documented way", () => {
    expect(verifyReloadlySignature(signed())).toEqual({ valid: true });
  });

  it("rejects a tampered body", () => {
    const { signature } = signed({ rawBody: BODY });
    const result = verifyReloadlySignature(
      signed({ rawBody: `${BODY} `, signature })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", "not-ours")
      .update(`${BODY}:${timestamp}`, "utf-8")
      .digest("hex");
    const result = verifyReloadlySignature({
      rawBody: BODY,
      timestamp,
      signature,
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a stale timestamp", () => {
    const result = verifyReloadlySignature(
      signed({ timestamp: String(Math.floor(Date.now() / 1000) - 3600) })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects a missing signature or timestamp", () => {
    const noSignature = verifyReloadlySignature({
      rawBody: BODY,
      secret: SECRET,
      timestamp: String(Math.floor(Date.now() / 1000)),
    });
    expect(noSignature.valid).toBe(false);
    expect(noSignature.reason).toBeTruthy();

    const noTimestamp = verifyReloadlySignature({
      rawBody: BODY,
      secret: SECRET,
      signature: createHmac("sha256", SECRET)
        .update(`${BODY}:`, "utf-8")
        .digest("hex"),
    });
    expect(noTimestamp.valid).toBe(false);
    expect(noTimestamp.reason).toBeTruthy();
  });

  it("accepts a millisecond timestamp", () => {
    const ms = Date.now();
    const result = verifyReloadlySignature({
      ...signed({ timestamp: String(ms) }),
      now: Math.floor(ms / 1000),
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects a timestamp that is not a number", () => {
    const result = verifyReloadlySignature(signed({ timestamp: "not-a-time" }));
    expect(result.valid).toBe(false);
  });
});

describe("parseReloadlyCallback", () => {
  it("reads the documented shape", () => {
    const result = parseReloadlyCallback(
      JSON.stringify({
        id: 1,
        type: TYPE,
        liveMode: false,
        date: "2022-02-28 08:07:00",
        data: {
          code: null,
          message: null,
          status: "SUCCESSFUL",
          transaction: {
            transactionId: 1,
            status: "SUCCESSFUL",
            customIdentifier: null,
          },
        },
      })
    );

    expect(result).toEqual({
      ok: true,
      event: {
        type: TYPE,
        liveMode: false,
        status: "SUCCESSFUL",
        transactionId: "1",
        customIdentifier: null,
        message: null,
      },
    });
  });

  it("falls back to data.code for the message", () => {
    const result = parseReloadlyCallback(
      JSON.stringify({
        type: TYPE,
        liveMode: true,
        data: { code: "INSUFFICIENT_BALANCE", status: "FAILED" },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.message).toBe("INSUFFICIENT_BALANCE");
    }
  });

  it("reads the transaction's own status when data.status is absent", () => {
    const result = parseReloadlyCallback(
      JSON.stringify({
        type: TYPE,
        data: {
          transaction: {
            transactionId: 1,
            status: "REFUNDED",
            customIdentifier: "w1:2",
          },
        },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.status).toBe("REFUNDED");
    }
  });

  it("refuses a type that is not ours", () => {
    const result = parseReloadlyCallback(
      JSON.stringify({
        type: "some.other.event",
        data: { status: "SUCCESSFUL" },
      })
    );
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it("refuses a payload with no status", () => {
    const result = parseReloadlyCallback(
      JSON.stringify({ type: TYPE, data: { message: "nope" } })
    );
    expect(result.ok).toBe(false);
  });

  it("refuses body text that is not JSON", () => {
    expect(parseReloadlyCallback("{not json").ok).toBe(false);
  });

  it("accepts a null transaction with both ids null", () => {
    const result = parseReloadlyCallback(
      JSON.stringify({
        type: TYPE,
        liveMode: false,
        data: { status: "PROCESSING", transaction: null },
      })
    );

    expect(result).toEqual({
      ok: true,
      event: {
        type: TYPE,
        liveMode: false,
        status: "PROCESSING",
        transactionId: null,
        customIdentifier: null,
        message: null,
      },
    });
  });
});

describe("reloadlyWebhookSecret", () => {
  const saved = process.env.RELOADLY_WEBHOOK_SECRET;

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.RELOADLY_WEBHOOK_SECRET;
    } else {
      process.env.RELOADLY_WEBHOOK_SECRET = saved;
    }
  });

  it("is null when unset", () => {
    delete process.env.RELOADLY_WEBHOOK_SECRET;
    expect(reloadlyWebhookSecret()).toBeNull();
  });

  it("is null when blank", () => {
    process.env.RELOADLY_WEBHOOK_SECRET = "   ";
    expect(reloadlyWebhookSecret()).toBeNull();
  });

  it("is trimmed when set", () => {
    process.env.RELOADLY_WEBHOOK_SECRET = "  whsec_test  ";
    expect(reloadlyWebhookSecret()).toBe("whsec_test");
  });
});
