import type { BasePayload } from "payload";

import {
  BLOCKED_FULFILMENT_STATUSES,
  type FulfilmentStatus,
} from "../../collections/giveaway/constants";
import { requeueOrHold } from "./fulfilPrizes";

/**
 * What the provider says happened to a payout, in the one shape both settle
 * paths agree on.
 *
 * The hourly sweep gets this from `topupStatus`, the webhook from a signed
 * callback. Both then hand it to {@link applyProviderVerdict}, so a verdict is
 * applied by one rule rather than two copies that drift apart.
 */
export type ProviderVerdict = {
  status: string;
  transactionId: string;
  message?: string;
  localAmount?: number;
  /**
   * The idempotency key the attempt was sent under, when the caller knows it.
   *
   * Recorded on the settlement row, because the reference is the only link
   * between an attempt and the failure that settles it: a webhook redelivery
   * of an id-less failure is recognised by this key and nothing else. The
   * sweep passes none — it is settling an attempt, not reading a key back.
   */
  providerReference?: string;
};

/** What applying a verdict did to the winner, counted by the sweep's summary. */
export type VerdictOutcome = "fulfilled" | "requeued" | "held" | "unchanged";

/**
 * Apply one provider verdict to one prize.
 *
 * The order below is the decision, not an implementation detail:
 *
 *   1. A blocked prize is left exactly as it is, whatever the provider says.
 *      `on_hold` is a person's decision, `awaiting_verification` is a step the
 *      winner still owes, and `cancelled` is a prize we have withdrawn — all
 *      three outrank a webhook, and a `SUCCESSFUL` that settles into a held
 *      prize would quietly undo a human's work.
 *   2. `SUCCESSFUL` settles the prize.
 *   3. `FAILED` and `REFUNDED` both mean unpaid: back to the queue, or to a
 *      person once it has failed too often. `confirmedTransactionId` tells the
 *      retry its key is spent, because the provider confirmed that transaction.
 *   4. Anything else is still settling, or a status we do not act on, and is
 *      left alone for a later pass.
 *
 * Nothing here notifies before it writes: `requeueOrHold` moves the winner
 * before it appends its attempt row, and `hold` sends its notifications after
 * its update. That "record the state first, notify second" ordering is what
 * lets a webhook handler answer the provider inside its 3-second cut-off.
 */
export async function applyProviderVerdict(
  payload: BasePayload,
  target: {
    winnerId: string;
    environment: "sandbox" | "live";
    phone?: string | null;
    currentStatus: FulfilmentStatus;
  },
  verdict: ProviderVerdict
): Promise<VerdictOutcome> {
  if (BLOCKED_FULFILMENT_STATUSES.includes(target.currentStatus)) {
    payload.logger.info(
      "[giveaway] ignoring a provider verdict for a blocked prize"
    );
    return "unchanged";
  }

  if (verdict.status === "SUCCESSFUL") {
    await payload.update({
      collection: "giveaway-winners",
      id: target.winnerId,
      data: {
        fulfilmentStatus: "fulfilled",
        fulfilledAt: new Date().toISOString(),
      },
    });
    return "fulfilled";
  }

  if (verdict.status === "FAILED" || verdict.status === "REFUNDED") {
    const outcome = await requeueOrHold(
      payload,
      {
        winnerId: target.winnerId,
        environment: target.environment,
        phone: target.phone,
      },
      verdict.localAmount ?? 0,
      verdict.message ?? `Provider reported ${verdict.status}`,
      {
        confirmedTransactionId: verdict.transactionId,
        providerReference: verdict.providerReference,
      }
    );

    return outcome === "pending" ? "requeued" : "held";
  }

  // Still settling: `PROCESSING` and anything else the provider has not
  // finished with. Logged so the wait is visible rather than silent.
  payload.logger.info(
    `[giveaway] winner ${target.winnerId} is ${verdict.status} at the provider`
  );
  return "unchanged";
}

/**
 * The newest id among the attempt rows given, not the newest row.
 *
 * A `retryable_failure` row records no transaction, and reading that row as
 * "no id" would re-queue a payout the provider may still be settling. Take the
 * docs already sorted by `-attemptedAt`.
 */
export function latestProviderTransactionId(
  attempts: { providerTransactionId?: string | null }[]
): string | undefined {
  const found = attempts
    .map((attempt) => attempt.providerTransactionId)
    .find((id) => id !== undefined && id !== null && String(id) !== "");

  return found ? String(found) : undefined;
}
