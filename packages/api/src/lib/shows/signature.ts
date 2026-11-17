import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * How far out of step Shows' clock may be, in seconds. Five minutes matches the
 * other webhook verifiers here and stops a captured request being replayed
 * indefinitely.
 */
export const SHOWS_SIGNATURE_TOLERANCE_SECONDS = 300;

const SIGNATURE_VERSION = "v1";
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const HEX_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The exact string Shows signs. Kept in one function because the composition
 * (`<timestamp>.<rawBody>`) comes from the integration docs rather than a
 * captured callback; if a live sample says otherwise, this is the one place to
 * change.
 */
export function showsSignaturePayload(
  timestamp: string,
  rawBody: string
): string {
  return `${timestamp}.${rawBody}`;
}

/**
 * The verdict on a webhook's signature.
 *
 * `stale` is separate from `bad` because the signature itself is genuine: a
 * retry can succeed once the clock catches up or Shows resends, whereas a bad
 * signature will never become valid.
 */
export type ShowsSignatureResult = "ok" | "bad" | "stale";

/**
 * Whether a webhook request really came from Shows.
 *
 * The signature covers the raw bytes exactly as received, so the caller must
 * verify before parsing anything out of the body. Missing or malformed headers
 * are `bad`; `expectedKeyId` is optional because v1 holds a single signing key,
 * and only proves which key signed when Shows issues more than one.
 *
 * The timestamp window is checked after the HMAC so a forged request with an
 * old timestamp is still `bad`; only a genuine signature can be `stale`.
 */
export function verifyShowsSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowSeconds: number,
  expectedKeyId: string | null = null
): ShowsSignatureResult {
  if (!secret) {
    return "bad";
  }

  const keyId = headers.get("shows-webhook-key-id")?.trim();
  if (!(keyId && KEY_ID_PATTERN.test(keyId))) {
    return "bad";
  }
  if (expectedKeyId !== null && keyId !== expectedKeyId) {
    return "bad";
  }

  const timestamp = headers.get("shows-webhook-timestamp")?.trim();
  if (!(timestamp && TIMESTAMP_PATTERN.test(timestamp))) {
    return "bad";
  }

  const sent = Number(timestamp);
  if (!Number.isSafeInteger(sent)) {
    return "bad";
  }

  const signature = headers.get("shows-webhook-signature")?.trim();
  if (!signature?.startsWith(`${SIGNATURE_VERSION}=`)) {
    return "bad";
  }

  const received = signature.slice(SIGNATURE_VERSION.length + 1);
  if (!HEX_PATTERN.test(received)) {
    return "bad";
  }

  const expected = createHmac("sha256", secret)
    .update(showsSignaturePayload(timestamp, rawBody), "utf-8")
    .digest("hex");

  // Both sides are 64 lowercase hex characters, so a length mismatch is
  // already impossible here; timingSafeEqual still needs them equal to throw.
  if (
    !timingSafeEqual(
      Buffer.from(expected, "utf-8"),
      Buffer.from(received, "utf-8")
    )
  ) {
    return "bad";
  }

  return Math.abs(nowSeconds - sent) > SHOWS_SIGNATURE_TOLERANCE_SECONDS
    ? "stale"
    : "ok";
}
