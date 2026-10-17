/**
 * Verifying, reading and settling a Reloadly payout callback.
 *
 * Reloadly posts the same transaction status we could also poll for, signed
 * with a key from the dashboard, so this file is the three parts of that
 * arrival: proving the bytes came from Reloadly, turning the envelope into a
 * small typed record, and deciding which prize the record is about. The first
 * two are pure — nothing touches the database or the clock beyond the `now` a
 * caller may inject — so they are cheap to test and neither can be tricked
 * into trusting an unverified body; only {@link applyReloadlyCallback} reads
 * and writes, and it is handed an already-verified record.
 *
 * Kept next to `didit.ts` rather than in the API package: the endpoint in
 * `packages/api` imports from here, and the dependency only runs that way.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { BasePayload, Where } from "payload";

import {
  applyProviderVerdict,
  latestProviderTransactionId,
} from "./providerVerdict";

/**
 * The only event type this endpoint acts on.
 *
 * Reloadly may post other services' events to the same URL; anything else is
 * acknowledged and dropped rather than guessed at.
 */
const CALLBACK_TYPE = "airtime_transaction.status";

/**
 * How far a callback's own timestamp may be from now before it is refused.
 *
 * Local, not imported from `partnerWebhookSignature.ts`: this library must not
 * depend on `packages/api`, and the same 300-second value `didit.ts` keeps to
 * itself is plenty for a live callback.
 */
const SIGNATURE_TOLERANCE_SECONDS = 300;

export type ReloadlyCallback = {
  type: string;
  /** Reloadly's environment discriminator: `false` is sandbox. */
  liveMode: boolean | null;
  /** Non-nullable: the parser only returns `ok` once it has a string status. */
  status: string;
  transactionId: string | null;
  customIdentifier: string | null;
  message: string | null;
};

export type ReloadlyVerification =
  | { ok: true; event: ReloadlyCallback }
  | { ok: false; reason: string };

/**
 * The webhook signing key, or null when it is absent or blank.
 *
 * Mirrors `diditConfigFromEnv`'s "provider absent unless configured" shape:
 * a half-configured provider is worse than an absent one, because callbacks
 * would arrive and no signature could ever be trusted.
 */
export function reloadlyWebhookSecret(): string | null {
  return process.env.RELOADLY_WEBHOOK_SECRET?.trim() || null;
}

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf-8").digest("hex");
}

/** Constant-time compare of two hex digests of possibly differing length. */
function hexEquals(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(received, "utf-8");
  // Length must be compared separately: timingSafeEqual throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Reloadly's sample is epoch seconds; a wrong guess rejects every callback.
 *
 * The spec does not pin the unit, so anything that could only be a
 * millisecond epoch is divided down before the freshness window is applied.
 */
function toSeconds(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return n >= 1e12 ? Math.floor(n / 1000) : n;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Ids arrive as numbers in Reloadly's sample but our columns are text, so
 * stringify numbers and treat anything missing, empty or non-scalar as null.
 */
function idOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return nonEmptyString(value);
}

/**
 * Whether a callback really came from Reloadly.
 *
 * Reloadly publishes HMAC-SHA256, hex, over `rawBody + ":" + timestamp`, keyed
 * by the dashboard signing key. The timestamp is inside the signed string, not
 * merely beside it, or it could be rewritten freely and the replay window
 * would mean nothing. The raw timestamp string is used as received; only the
 * freshness window normalises its unit.
 */
export function verifyReloadlySignature({
  rawBody,
  signature,
  timestamp,
  secret,
  now = Math.floor(Date.now() / 1000),
}: {
  rawBody: string;
  signature?: string | null;
  timestamp?: string | null;
  secret: string;
  now?: number;
}): { valid: boolean; reason?: string } {
  if (!secret) {
    return { valid: false, reason: "no webhook secret" };
  }

  const sig = signature?.trim();
  if (!sig) {
    return { valid: false, reason: "missing signature" };
  }

  const sentTimestamp = timestamp?.trim();
  if (!sentTimestamp) {
    return { valid: false, reason: "missing timestamp" };
  }

  const sent = toSeconds(sentTimestamp);
  if (sent === null) {
    return { valid: false, reason: "malformed timestamp" };
  }

  if (Math.abs(now - sent) > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, reason: "timestamp outside the accepted window" };
  }

  const expected = hmac(secret, `${rawBody}:${sentTimestamp}`);
  return hexEquals(expected, sig)
    ? { valid: true }
    : { valid: false, reason: "signature does not match" };
}

/**
 * Read a verified callback body.
 *
 * Every field is checked, never asserted: this runs on JSON from the public
 * internet. A payload with no transaction is deliberately `ok`: "signed, but
 * there is nothing in it to match on" is a decision for the applier, not a
 * reason to refuse the callback outright.
 */
export function parseReloadlyCallback(rawBody: string): ReloadlyVerification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "body is not JSON" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "body is not an object" };
  }

  const envelope = parsed as Record<string, unknown>;
  if (envelope.type !== CALLBACK_TYPE) {
    return { ok: false, reason: "unexpected event type" };
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "no event data" };
  }

  const payload = data as Record<string, unknown>;
  const transaction =
    payload.transaction && typeof payload.transaction === "object"
      ? (payload.transaction as Record<string, unknown>)
      : null;

  // `data.status` drives the outcome; the transaction carries a second copy
  // for shapes where the first is absent. Neither means nothing can be applied.
  const status =
    nonEmptyString(payload.status) ?? nonEmptyString(transaction?.status);
  if (status === null) {
    return { ok: false, reason: "no status" };
  }

  const message =
    nonEmptyString(payload.message) ?? nonEmptyString(payload.code);

  return {
    ok: true,
    event: {
      type: CALLBACK_TYPE,
      liveMode:
        typeof envelope.liveMode === "boolean" ? envelope.liveMode : null,
      status,
      transactionId: idOrNull(transaction?.transactionId),
      customIdentifier: idOrNull(transaction?.customIdentifier),
      message,
    },
  };
}

/** What a callback did to the prize it matched, or why it was let past. */
export type CallbackOutcome =
  | "fulfilled"
  | "requeued"
  | "held"
  | "unchanged"
  | "ignored"
  | "duplicate";

/**
 * Find the prize an already-verified callback is about and settle its fate.
 *
 * The order below is the decision, not an implementation detail: a callback
 * that matches nothing, comes from the other environment, names a prize we no
 * longer have, repeats a failure we already recorded, or belongs to a dispatch
 * the winner has moved past must all change nothing. Getting the match wrong
 * either leaves a genuinely failed payout reading as paid or pays a winner
 * twice, so every check that could stop a write runs before the verdict does.
 *
 * Deliberately does not catch database errors: a fault has to reach the HTTP
 * handler so it can answer 5xx and Reloadly can retry the callback.
 */
export async function applyReloadlyCallback(
  payload: BasePayload,
  event: ReloadlyCallback
): Promise<{ outcome: CallbackOutcome; reason?: string }> {
  const ignore = (reason: string) => {
    payload.logger.info(`[giveaway] ignoring a Reloadly callback: ${reason}`);
    return { outcome: "ignored" as const, reason };
  };

  // 1. Match by transaction id first; the custom identifier is the fallback
  // and is only consulted when the callback carries no transaction id.
  const where: Where | null = event.transactionId
    ? { providerTransactionId: { equals: event.transactionId } }
    : event.customIdentifier
      ? { providerReference: { equals: event.customIdentifier } }
      : null;

  const found = where
    ? await payload.find({
        collection: "giveaway-fulfilment-attempts",
        where,
        sort: "-attemptedAt",
        limit: 1,
        depth: 0,
      })
    : null;
  const attempt = found?.docs[0];

  if (!attempt) {
    return ignore("unknown transaction");
  }

  // 2. The environment is part of the identity: a sandbox callback cannot
  // settle a live payout. A missing `liveMode` is not a live `true`, so it
  // mismatches too.
  if (event.liveMode !== (attempt.environment === "live")) {
    return ignore("environment mismatch");
  }

  // 3. Read the winner now, and hand the verdict *this* status. A status
  // carried across from an earlier step could let a callback overwrite a
  // decision made since, which is exactly what the hold check exists to stop.
  const winner = await payload.findByID({
    collection: "giveaway-winners",
    id: String(attempt.winner),
    depth: 0,
    disableErrors: true,
  });

  if (!winner) {
    return ignore("unknown winner");
  }

  const matchedTransactionId = attempt.providerTransactionId
    ? String(attempt.providerTransactionId)
    : "";

  // 4. A redelivery of a failure we have already recorded is acknowledged and
  // dropped: applying it again would spend one of the five retries on nothing.
  if (event.status !== "SUCCESSFUL") {
    const alreadyRecorded = await payload.count({
      collection: "giveaway-fulfilment-attempts",
      where: {
        and: [
          { outcome: { equals: "retryable_failure" } },
          matchedTransactionId
            ? { providerTransactionId: { equals: matchedTransactionId } }
            : {
                providerReference: {
                  equals: String(attempt.providerReference ?? ""),
                },
              },
        ],
      },
    });

    if (alreadyRecorded.totalDocs > 0) {
      return { outcome: "duplicate" };
    }
  }

  // 5. A later dispatch owns this prize's fate. Applying this one would put the
  // winner back in the queue while the current payout is still in flight, and
  // the sweep would then pay a second time.
  const recent = await payload.find({
    collection: "giveaway-fulfilment-attempts",
    where: { winner: { equals: attempt.winner } },
    sort: "-attemptedAt",
    limit: 10,
    depth: 0,
  });
  const newest = latestProviderTransactionId(recent.docs);

  if (newest !== undefined && newest !== matchedTransactionId) {
    return ignore("superseded");
  }

  // 6. Apply. The verdict carries the attempt row's transaction id, not the
  // callback's, so a key-only match still tells the retry its key is spent; it
  // carries the row's key too, so the settlement row records what it settled
  // and a redelivery of the same id-less failure is recognised by it.
  const outcome = await applyProviderVerdict(
    payload,
    {
      winnerId: String(attempt.winner),
      environment: attempt.environment,
      phone: winner.claimPhone,
      currentStatus: winner.fulfilmentStatus,
    },
    {
      status: event.status,
      transactionId: attempt.providerTransactionId ?? event.transactionId ?? "",
      providerReference: attempt.providerReference ?? undefined,
      message: event.message ?? undefined,
      localAmount: attempt.localAmount ?? undefined,
    }
  );

  return { outcome };
}
