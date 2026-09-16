import { createVerify } from "node:crypto";

import { GOOGLE_SSV_FRESHNESS_MS } from "../../collections/giveaway/constants";

/**
 * Verification of Google's rewarded-ad server-side callback.
 *
 * A Google rewarded impression is the one Boost the app cannot vouch for. A
 * partner Boost names the item it played and the engine checks that item's
 * placement, so the claim carries its own evidence. A Google ad has no such
 * record, so "I watched one" from the client is worth nothing: three calls to
 * the endpoint and anybody has the Boosts a top tier asks for.
 *
 * The callback closes that gap by moving the claim off the client entirely.
 * Google calls us directly, over the public internet, with a signature over
 * the query string made with a private key we never see. Everything in this
 * file exists to check that signature, and to make sure one signed URL can
 * only ever be spent once.
 */

/** Where Google publishes the public half of its callback signing keys. */
const VERIFIER_KEYS_URL =
  "https://www.gstatic.com/admob/reward/verifier-keys.json";

/**
 * How long a fetched key set is trusted before it is fetched again.
 *
 * Google rotates these, but not on a schedule we are told about, so the cache
 * is a courtesy to their endpoint rather than a correctness mechanism. An
 * unknown `key_id` forces a refetch regardless of this, which is what actually
 * makes rotation survivable — see `publicKeyFor`.
 */
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type VerifierKey = { keyId: number; pem: string };

let keyCache: { keys: Map<string, string>; fetchedAt: number } | null = null;

async function fetchVerifierKeys(): Promise<Map<string, string>> {
  const response = await fetch(VERIFIER_KEYS_URL);
  if (!response.ok) {
    throw new Error(
      `Could not fetch Google verifier keys: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as { keys?: VerifierKey[] };
  const keys = new Map<string, string>();
  for (const key of body.keys ?? []) {
    if (key?.keyId !== undefined && typeof key.pem === "string") {
      keys.set(String(key.keyId), key.pem);
    }
  }

  if (keys.size === 0) {
    throw new Error("Google verifier key set was empty.");
  }

  return keys;
}

/**
 * The public key for one `key_id`, refetching once if it is not already known.
 *
 * The refetch is the whole point: when Google rotates a key, the first
 * callback signed with the new one arrives before anything has told us to look
 * again. Without this, every callback would fail from the moment of rotation
 * until the cache happened to expire.
 */
async function publicKeyFor(keyId: string): Promise<string | null> {
  const fresh =
    keyCache !== null && Date.now() - keyCache.fetchedAt < KEY_CACHE_TTL_MS;

  if (fresh) {
    const cached = keyCache?.keys.get(keyId);
    if (cached) {
      return cached;
    }
  }

  const keys = await fetchVerifierKeys();
  keyCache = { keys, fetchedAt: Date.now() };
  return keys.get(keyId) ?? null;
}

/** Discard the cached key set. Exposed for tests. */
export function resetVerifierKeyCache(): void {
  keyCache = null;
}

export type SsvCallback = {
  transactionId: string;
  userId: string;
  customData: string | null;
  adUnit: string | null;
  rewardItem: string | null;
  rewardAmount: string | null;
  timestamp: number;
};

export type SsvVerification =
  | { ok: true; callback: SsvCallback }
  | { ok: false; reason: string };

/**
 * Check a callback URL's signature, freshness and required parameters.
 *
 * Takes the whole URL rather than parsed parameters on purpose. Google signs
 * the raw query string, exactly as sent, so the bytes that get verified have
 * to be sliced out of it before anything parses or re-encodes them: round-trip
 * a `URLSearchParams` and a legitimate callback starts failing over an escaped
 * character that changed case.
 */
export async function verifySsvCallback(
  rawUrl: string,
  now: number = Date.now()
): Promise<SsvVerification> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "malformed_url" };
  }

  /*
   * Google documents `signature` and `key_id` as the last two parameters, in
   * that order, and signs everything before them. The slice runs from after
   * the leading "?" to the "&signature=" that begins the pair.
   */
  const signatureMarker = "&signature=";
  const markerIndex = url.search.indexOf(signatureMarker);
  if (markerIndex === -1) {
    return { ok: false, reason: "missing_signature" };
  }

  const signedContent = url.search.slice(1, markerIndex);
  const params = url.searchParams;

  const signature = params.get("signature");
  const keyId = params.get("key_id");
  if (!(signature && keyId)) {
    return { ok: false, reason: "missing_signature" };
  }

  let publicKey: string | null;
  try {
    publicKey = await publicKeyFor(keyId);
  } catch {
    /*
     * Distinct from `unknown_key`: we could not ask, rather than asked and
     * were told no. The caller answers 5xx so Google retries, instead of
     * discarding a callback that may well have been genuine.
     */
    return { ok: false, reason: "keys_unavailable" };
  }

  if (!publicKey) {
    return { ok: false, reason: "unknown_key" };
  }

  // Google encodes the signature web-safe and strips the padding.
  const derSignature = Buffer.from(signature, "base64url");

  let valid: boolean;
  try {
    valid = createVerify("SHA256")
      .update(signedContent)
      .verify(publicKey, derSignature);
  } catch {
    // A malformed signature throws rather than returning false.
    valid = false;
  }

  if (!valid) {
    return { ok: false, reason: "bad_signature" };
  }

  /*
   * Everything below is read only after the signature holds, so these values
   * are Google's words rather than the caller's.
   */
  const transactionId = params.get("transaction_id");
  const userId = params.get("user_id");

  if (!transactionId) {
    return { ok: false, reason: "missing_transaction_id" };
  }

  /*
   * Absent when the app did not set one. Every Boost has to belong to
   * somebody, so a callback without it is a rewarded ad shown somewhere that
   * was not asking for a Boost, not an error to shout about.
   */
  if (!userId) {
    return { ok: false, reason: "missing_user_id" };
  }

  const timestampRaw = params.get("timestamp");
  const timestamp = timestampRaw ? Number(timestampRaw) : Number.NaN;
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "missing_timestamp" };
  }

  /*
   * A valid signature never expires on its own, so a captured URL would
   * otherwise stay spendable forever. The unique `transaction_id` already
   * stops it being spent twice; this stops it being held and spent late.
   * Both directions are checked: a timestamp far in the future is as wrong as
   * one far in the past, and only a clock problem or a forgery produces it.
   */
  if (Math.abs(now - timestamp) > GOOGLE_SSV_FRESHNESS_MS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  return {
    ok: true,
    callback: {
      transactionId,
      userId,
      customData: params.get("custom_data"),
      adUnit: params.get("ad_unit"),
      rewardItem: params.get("reward_item"),
      rewardAmount: params.get("reward_amount"),
      timestamp,
    },
  };
}
