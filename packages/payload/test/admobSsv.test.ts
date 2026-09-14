import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSign, generateKeyPairSync } from "node:crypto";

import {
  resetVerifierKeyCache,
  verifySsvCallback,
} from "../src/lib/giveaway/admobSsv";

/**
 * These tests stand in for the one thing about a Google Boost that cannot be
 * checked any other way: that a callback we did not receive from Google is
 * refused. The endpoint is unauthenticated by necessity, so the signature is
 * the entire lock, and a regression here would not fail loudly — it would
 * quietly accept forged eligibility.
 */

const KEY_ID = "3335741209";
const NOW = 1_757_000_000_000;

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

const originalFetch = globalThis.fetch;

/** Serve our own key set in place of Google's, under the id we sign with. */
function serveKeys(keys: { keyId: string; pem: string }[]) {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        keys: keys.map((key) => ({ keyId: Number(key.keyId), pem: key.pem })),
      }),
      { status: 200 }
    )) as typeof fetch;
}

/**
 * Build a callback URL the way Google does: sign everything up to
 * `&signature=`, then append the signature and key id in that order.
 */
function signedUrl(
  overrides: Record<string, string> = {},
  signWith = privateKey
) {
  const params = new URLSearchParams({
    ad_network: "5450213213286189855",
    ad_unit: "1234567890",
    custom_data: JSON.stringify({ purpose: "boost" }),
    reward_amount: "1",
    reward_item: "boost",
    timestamp: String(NOW),
    transaction_id: "abc123",
    user_id: "user-1",
    ...overrides,
  });

  const content = params.toString();
  const signature = createSign("SHA256")
    .update(content)
    .sign(signWith)
    .toString("base64url");

  return `https://example.com/api/ads/admob-ssv?${content}&signature=${signature}&key_id=${KEY_ID}`;
}

beforeEach(() => {
  resetVerifierKeyCache();
  serveKeys([{ keyId: KEY_ID, pem: publicPem }]);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetVerifierKeyCache();
});

describe("verifySsvCallback", () => {
  test("accepts a callback signed by a published key", async () => {
    const result = await verifySsvCallback(signedUrl(), NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.callback.transactionId).toBe("abc123");
      expect(result.callback.userId).toBe("user-1");
      expect(result.callback.customData).toBe(
        JSON.stringify({ purpose: "boost" })
      );
    }
  });

  test("refuses a callback whose query was edited after signing", async () => {
    // Re-pointing a genuine callback at another account is the cheapest
    // forgery available, so it is the one worth proving refused.
    const tampered = signedUrl().replace("user_id=user-1", "user_id=user-2");
    const result = await verifySsvCallback(tampered, NOW);

    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  test("refuses a callback signed by a key Google never published", async () => {
    const impostor = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const result = await verifySsvCallback(
      signedUrl({}, impostor.privateKey),
      NOW
    );

    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  test("refuses a valid signature replayed outside the freshness window", async () => {
    const result = await verifySsvCallback(
      signedUrl(),
      NOW + 25 * 60 * 60 * 1000
    );

    expect(result).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  test("refuses a callback carrying no signature at all", async () => {
    const result = await verifySsvCallback(
      "https://example.com/api/ads/admob-ssv?user_id=user-1&transaction_id=abc123",
      NOW
    );

    expect(result).toEqual({ ok: false, reason: "missing_signature" });
  });

  test("reports unknown_key when the key id is absent from the key set", async () => {
    serveKeys([{ keyId: "999", pem: publicPem }]);
    const result = await verifySsvCallback(signedUrl(), NOW);

    expect(result).toEqual({ ok: false, reason: "unknown_key" });
  });

  test("asks for a retry rather than judging when the key set is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const result = await verifySsvCallback(signedUrl(), NOW);

    expect(result).toEqual({ ok: false, reason: "keys_unavailable" });
  });

  test("refetches the key set when a rotated key id arrives", async () => {
    // Warm the cache with a set that does not contain our key.
    serveKeys([{ keyId: "999", pem: publicPem }]);
    await verifySsvCallback(signedUrl(), NOW);

    // Google rotates; the next callback is signed by a key we have not seen.
    serveKeys([{ keyId: KEY_ID, pem: publicPem }]);
    const result = await verifySsvCallback(signedUrl(), NOW);

    expect(result.ok).toBe(true);
  });
});
