import type { BasePayload } from "payload";

import { defaultReloadlyClient } from "./fulfilPrizes";
import type { ReloadlyClient } from "./reloadly";

/**
 * How long a dispatch may be in flight before the provider is asked about it.
 *
 * A dispatch takes seconds, so half an hour is safely past any live run and
 * still inside the hourly cadence.
 */
const STALE_AFTER_MS = 30 * 60 * 1000;

export type ReconciliationSummary = {
  checked: number;
  fulfilled: number;
  requeued: number;
};

/**
 * Settle prizes the provider has finished with since we last looked (spec 15).
 *
 * A dispatch that Reloadly does not answer `SUCCESSFUL` is left `in_progress`,
 * and the fulfilment sweep only selects `pending`, so without this pass those
 * prizes would show "Sending now" forever. Here the transaction id recorded on
 * the way out is handed back to Reloadly, which is the only thing that knows
 * what happened to it.
 *
 * Only prizes stale enough to be past any live dispatch are looked at, and
 * anything other than a plain `SUCCESSFUL` is left alone for a later pass: a
 * status still settling is not a failure.
 *
 * Never throws. This runs inside the scheduled task alongside the draw, and a
 * provider being unreachable must not take down the draw that shares the run.
 */
export async function reconcileInProgressPrizes(
  payload: BasePayload,
  { client, limit }: { client?: ReloadlyClient; limit?: number } = {}
): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    checked: 0,
    fulfilled: 0,
    requeued: 0,
  };

  const resolved = client ?? defaultReloadlyClient(payload);
  if (!resolved) {
    return summary;
  }

  const pending = await payload.find({
    collection: "giveaway-winners",
    where: { fulfilmentStatus: { equals: "in_progress" } },
    limit,
    pagination: false,
    depth: 0,
  });

  // Compared in code rather than in the query: it is one comparison, and it
  // keeps the pass easy to test.
  const cutoff = Date.now() - STALE_AFTER_MS;

  for (const winner of pending.docs) {
    if (new Date(winner.updatedAt).getTime() > cutoff) {
      continue;
    }

    summary.checked += 1;

    try {
      const attempts = await payload.find({
        collection: "giveaway-fulfilment-attempts",
        where: { winner: { equals: winner.id } },
        sort: "-attemptedAt",
        limit: 10,
      });

      /**
       * The newest id, not the newest row: a `retryable_failure` records no
       * transaction, and reading that row as "no id" would re-queue a payout
       * the provider may still be settling.
       */
      const transactionId = attempts.docs
        .map((attempt) => attempt.providerTransactionId)
        .find((id) => id !== undefined && id !== null && String(id) !== "");

      if (!transactionId) {
        // The run died between claiming the prize and recording the send.
        // The attempt number never advanced, so the re-send reuses its key
        // and cannot pay twice.
        await payload.update({
          collection: "giveaway-winners",
          id: winner.id,
          data: { fulfilmentStatus: "pending" },
        });
        summary.requeued += 1;
        continue;
      }

      const { status } = await resolved.topupStatus(String(transactionId));

      if (status === "SUCCESSFUL") {
        await payload.update({
          collection: "giveaway-winners",
          id: winner.id,
          data: {
            fulfilmentStatus: "fulfilled",
            fulfilledAt: new Date().toISOString(),
          },
        });
        summary.fulfilled += 1;
      } else {
        // Still settling, refused, or unknown to the provider: a later pass
        // settles these. Logged so the wait is visible rather than silent.
        payload.logger.info(
          `[giveaway] winner ${winner.id} is ${status} at the provider`
        );
      }
    } catch (error) {
      // One bad record must not stop the pass or throw into the shared run.
      payload.logger.error(
        { err: error, winnerId: winner.id },
        "[giveaway] could not reconcile an in-progress prize"
      );
    }
  }

  return summary;
}
