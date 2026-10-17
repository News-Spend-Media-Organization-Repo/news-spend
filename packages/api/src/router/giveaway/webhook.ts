import { getPayload } from "@news-spend-media/payload";
import {
  applyReloadlyCallback,
  parseReloadlyCallback,
  reloadlyWebhookSecret,
  verifyReloadlySignature,
} from "@news-spend-media/payload/lib/giveaway/reloadlyWebhook";
import type { BasePayload } from "payload";

/**
 * Reloadly's payout webhook (spec 18).
 *
 * Called by Reloadly, never by the app, and unauthenticated in the usual
 * sense: Reloadly holds no session with us, so the HMAC over the exact bytes
 * it sent is the ONLY thing between a forged request and a released prize.
 * Nothing is read out of the body before the signature has been checked;
 * verification runs on the raw text, never on the parsed object.
 *
 * Status codes are a retry protocol, not commentary. Reloadly redelivers
 * anything that is not 2xx, so 2xx is returned for anything we have finished
 * dealing with, even when the answer is "this means nothing to us". Only a
 * failed signature gets 401, only body text that is not JSON gets 400, and
 * only a genuine fault gets 5xx — the two cases where a retry is the right
 * behaviour. A misconfigured endpoint is 503 rather than silent acceptance.
 *
 * The `injected` payload exists for tests: the outcome branches are exercised
 * against a fake without a database, and the 401 path can prove it never
 * resolved one.
 */
export async function reloadlyWebhookHandler(
  req: Request,
  injected?: BasePayload
): Promise<Response> {
  const secret = reloadlyWebhookSecret();
  if (!secret) {
    // Nothing is configured, so nothing can be verified. Accepting it would be
    // pretending; 503 lets Reloadly retry once we are wired up.
    return json({ message: "Webhook is not configured" }, 503);
  }

  if (req.method !== "POST") {
    return json({ message: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();

  // Well-formedness only, before the signature. Didit's handler does the same,
  // and nothing is *read* out of the body until the signature below passes:
  // verification uses these exact bytes, never the parsed object.
  try {
    JSON.parse(rawBody);
  } catch {
    return json({ message: "Invalid JSON" }, 400);
  }

  const signature = req.headers.get("x-reloadly-signature");
  const timestamp = req.headers.get("x-reloadly-request-timestamp");

  const valid = verifyReloadlySignature({
    rawBody,
    signature,
    timestamp,
    secret,
  });
  if (!valid.valid) {
    // The header names and the timestamp format come from Reloadly's docs and
    // no live callback has ever been captured, so a 401 with no reason would
    // mean every genuine callback failing in silence. `console.warn` for the
    // same reason as admobSsv (`admobSsv.ts:68`): the payload instance is
    // deliberately not resolved on this path, so no database connection is
    // opened for an unsigned request. The body is not logged — it is
    // unverified bytes.
    console.warn("[giveaway] Reloadly callback rejected", {
      reason: valid.reason,
      timestamp,
      hasSignature: Boolean(signature),
    });
    return json({ message: "Unauthorized" }, 401);
  }

  const payload = injected ?? (await getPayload());

  const parsed = parseReloadlyCallback(rawBody);
  if (!parsed.ok) {
    payload.logger.info(
      { rawBody, reason: parsed.reason },
      "[giveaway] Reloadly callback ignored"
    );
    return json({ message: "Nothing to do", acknowledged: true }, 200);
  }

  // Every genuine callback, whole, so the first live one pins the mapping the
  // sandbox could not supply.
  payload.logger.info({ rawBody }, "[giveaway] Reloadly callback");

  try {
    const { outcome, reason } = await applyReloadlyCallback(
      payload,
      parsed.event
    );
    return json({ message: "Processed", outcome, reason }, 200);
  } catch (error) {
    // A real fault on our side: 5xx so Reloadly retries rather than dropping a
    // verdict a winner is waiting on.
    payload.logger.error({ err: error }, "[giveaway] Reloadly callback failed");
    return json({ message: "Could not process the callback" }, 500);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
