import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";

import { verifyShowsSignature } from "./signature";

/**
 * Shows signs `<timestamp>.<rawBody>` with HMAC-SHA256 and sends it as
 * `v1=<lowercase hex>` alongside the timestamp and key id. The clock is a
 * parameter, so the window is tested without sleeping and without depending on
 * when the suite runs.
 */

const SECRET = "whsec_shows_test";
const KEY_ID = "key_test_1";
const NOW = 1_700_000_000;
const BODY = JSON.stringify({ id: "evt_1", type: "order.transitioned" });
const TAMPERED = JSON.stringify({ id: "evt_1", type: "order.refunded" });

function sign({
  rawBody = BODY,
  timestamp = String(NOW),
  secret = SECRET,
}: {
  rawBody?: string;
  timestamp?: string;
  secret?: string;
} = {}): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf-8")
    .digest("hex");
  return `v1=${digest}`;
}

function headers({
  timestamp = String(NOW),
  keyId = KEY_ID,
  signature,
}: {
  timestamp?: string | null;
  keyId?: string | null;
  signature?: string | null;
} = {}): Headers {
  const result = new Headers();

  if (timestamp !== null) {
    result.set("Shows-Webhook-Timestamp", timestamp);
  }
  if (keyId !== null) {
    result.set("Shows-Webhook-Key-Id", keyId);
  }

  const value =
    signature === undefined
      ? timestamp === null
        ? null
        : sign({ timestamp })
      : signature;
  if (value !== null) {
    result.set("Shows-Webhook-Signature", value);
  }

  return result;
}

function verify(
  input: {
    rawBody?: string;
    headers?: Headers;
    secret?: string;
    now?: number;
  } = {},
  expectedKeyId: string | null = null
): boolean {
  return verifyShowsSignature(
    input.rawBody ?? BODY,
    input.headers ?? headers(),
    input.secret ?? SECRET,
    input.now ?? NOW,
    expectedKeyId
  );
}

describe("verifyShowsSignature", () => {
  it("accepts the signature Shows would send", () => {
    expect(verify()).toBe(true);
  });

  it("accepts a timestamp exactly on the 300-second edge", () => {
    const timestamp = String(NOW - 300);

    expect(verify({ headers: headers({ timestamp }) })).toBe(true);
  });

  it("rejects a signature 301 seconds old", () => {
    const timestamp = String(NOW - 301);

    expect(verify({ headers: headers({ timestamp }) })).toBe(false);
  });

  it("rejects a timestamp from 301 seconds in the future", () => {
    const timestamp = String(NOW + 301);

    expect(verify({ headers: headers({ timestamp }) })).toBe(false);
  });

  it("rejects a timestamp that is not a number", () => {
    const timestamp = "now";

    expect(verify({ headers: headers({ timestamp }) })).toBe(false);
  });

  it("rejects a signature computed for another body", () => {
    expect(
      verify({ rawBody: TAMPERED, headers: headers({ signature: sign() }) })
    ).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(
      verify({
        headers: headers({ signature: sign({ secret: "whsec_other" }) }),
      })
    ).toBe(false);
  });

  it("rejects a signature without the v1 prefix", () => {
    const signature = sign().slice("v1=".length);

    expect(verify({ headers: headers({ signature }) })).toBe(false);
  });

  it("rejects uppercase hex", () => {
    const signature = `v1=${sign().slice("v1=".length).toUpperCase()}`;

    expect(verify({ headers: headers({ signature }) })).toBe(false);
  });

  it("rejects a truncated signature", () => {
    expect(verify({ headers: headers({ signature: "v1=abc123" }) })).toBe(
      false
    );
  });

  it("rejects a missing signature", () => {
    expect(verify({ headers: headers({ signature: null }) })).toBe(false);
  });

  it("rejects a missing timestamp", () => {
    expect(verify({ headers: headers({ timestamp: null }) })).toBe(false);
  });

  it("rejects a missing key id", () => {
    expect(verify({ headers: headers({ keyId: null }) })).toBe(false);
  });

  it("rejects a malformed key id", () => {
    expect(verify({ headers: headers({ keyId: "key with spaces" }) })).toBe(
      false
    );
  });

  it("rejects a different key id when one is expected", () => {
    expect(verify({}, "key_rotated")).toBe(false);
    expect(verify({}, KEY_ID)).toBe(true);
  });

  it("rejects an empty secret", () => {
    expect(verify({ secret: "" })).toBe(false);
  });
});
