import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { resetVerifierKeyCache } from "@news-spend-media/payload/lib/giveaway/admobSsv";

import { admobSsvHandler } from "../src/router/ads/admobSsv";

/**
 * The status codes this endpoint returns are a retry protocol for Google, not
 * commentary on what we thought of the call — and AdMob will not even accept
 * the callback URL unless the console's own unsigned ping gets a 2xx. Both
 * facts are invisible from the code alone, which is why they are pinned here:
 * "harden" this back to a 403 and the URL can no longer be configured.
 */

const ENDPOINT = "https://api.newsspend.com/api/ads/admob-ssv";

const originalFetch = globalThis.fetch;

const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

/** Serve a real, published key so the signature is what fails, not the lookup. */
function servePublishedKey() {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ keys: [{ keyId: 1, pem: publicPem }] }), {
      status: 200,
    })) as unknown as typeof fetch;
}

beforeEach(() => {
  resetVerifierKeyCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetVerifierKeyCache();
});

describe("admobSsvHandler", () => {
  it("acknowledges an unsigned request with 200 and credits nothing", async () => {
    // This is the shape of AdMob's URL verification ping, and of a browser
    // visit. A 4xx here is what stopped the callback URL being saved at all.
    const response = await admobSsvHandler(new Request(ENDPOINT));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Acknowledged",
      credited: false,
    });
  });

  it("acknowledges a forged signature with 200 rather than inviting a retry", async () => {
    servePublishedKey();

    const response = await admobSsvHandler(
      new Request(
        `${ENDPOINT}?user_id=u1&transaction_id=t1&timestamp=${Date.now()}&signature=bogus&key_id=1`
      )
    );

    // A signature that did not verify will not verify on redelivery either.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ credited: false });
  });

  it("asks Google to retry when its key set could not be reached", async () => {
    // The one case we genuinely have not judged, so the reward must not be
    // dropped on our account.
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const response = await admobSsvHandler(
      new Request(
        `${ENDPOINT}?user_id=u1&transaction_id=t1&timestamp=${Date.now()}&signature=bogus&key_id=1`
      )
    );

    expect(response.status).toBe(503);
  });

  it("refuses a method Google never uses", async () => {
    const response = await admobSsvHandler(
      new Request(ENDPOINT, { method: "POST" })
    );

    expect(response.status).toBe(405);
  });
});
