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
 * Whether a webhook request really came from Shows.
 *
 * The signature covers the raw bytes exactly as received, so the caller must
 * verify before parsing anything out of the body. Missing or malformed headers
 * are rejected outright; `expectedKeyId` is optional because v1 holds a single
 * signing key, and only proves which key signed when Shows issues more than
 * one.
 */
export function verifyShowsSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowSeconds: number,
  expectedKeyId: string | null = null
): boolean {
  if (!secret) {
    return false;
  }

  const keyId = headers.get("shows-webhook-key-id")?.trim();
  if (!(keyId && KEY_ID_PATTERN.test(keyId))) {
    return false;
  }
  if (expectedKeyId !== null && keyId !== expectedKeyId) {
    return false;
  }

  const timestamp = headers.get("shows-webhook-timestamp")?.trim();
  if (!(timestamp && TIMESTAMP_PATTERN.test(timestamp))) {
    return false;
  }

  const sent = Number(timestamp);
  if (!Number.isSafeInteger(sent)) {
    return false;
  }
  if (Math.abs(nowSeconds - sent) > SHOWS_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signature = headers.get("shows-webhook-signature")?.trim();
  if (!signature?.startsWith(`${SIGNATURE_VERSION}=`)) {
    return false;
  }

  const received = signature.slice(SIGNATURE_VERSION.length + 1);
  if (!HEX_PATTERN.test(received)) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(showsSignaturePayload(timestamp, rawBody), "utf-8")
    .digest("hex");

  // Both sides are 64 lowercase hex characters, so a length mismatch is
  // already impossible here; timingSafeEqual still needs them equal to throw.
  return timingSafeEqual(
    Buffer.from(expected, "utf-8"),
    Buffer.from(received, "utf-8")
  );
}
