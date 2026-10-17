import type { BasePayload } from "payload";

import { defaultReloadlyClient, hold, requeueOrHold } from "./fulfilPrizes";
import { type ReloadlyClient, ReloadlyError } from "./reloadly";

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
  held: number;
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
 * Only prizes stale enough to be past any live dispatch are looked at. A
 * `SUCCESSFUL` settles the prize; `FAILED` and `REFUNDED` both mean the winner
 * is unpaid and the prize goes back to the queue; a 404 means our record and
 * the provider's disagree about money, so a person decides; and anything else
 * — still settling, or a fault we never got an answer from — is left alone for
 * a later pass.
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
    held: 0,
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

    // Looked up in the catch too, so the reason a 404 is held names the
    // transaction the provider did not recognise.
    let transactionId: string | undefined;

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
      const found = attempts.docs
        .map((attempt) => attempt.providerTransactionId)
        .find((id) => id !== undefined && id !== null && String(id) !== "");

      if (!found) {
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

      transactionId = String(found);
      const { status } = await resolved.topupStatus(transactionId);

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
      } else if (status === "FAILED" || status === "REFUNDED") {
        /**
         * The same branch for both: the money is equally absent either way, a
         * refund returns it. Passing the transaction id is what tells the next
         * attempt that this failure is confirmed and its key is spent.
         */
        const outcome = await requeueOrHold(
          payload,
          {
            winnerId: String(winner.id),
            environment: resolved.isSandbox ? "sandbox" : "live",
            phone: winner.claimPhone,
          },
          0,
          `Provider reported ${status}`,
          { confirmedTransactionId: transactionId }
        );

        if (outcome === "pending") {
          summary.requeued += 1;
        } else {
          summary.held += 1;
        }
      } else {
        // Still settling: `PROCESSING` and anything else the provider has not
        // finished with. A later pass settles these. Logged so the wait is
        // visible rather than silent.
        payload.logger.info(
          `[giveaway] winner ${winner.id} is ${status} at the provider`
        );
      }
    } catch (error) {
      if (error instanceof ReloadlyError && error.status === 404) {
        // Our record says we sent a transaction and the provider says it has
        // never heard of it: two statements that disagree about money, so a
        // person decides. Re-queueing would be a guess with a payout behind
        // it, and re-reading it would loop forever.
        await hold(
          payload,
          String(winner.id),
          `Reloadly does not recognise transaction ${transactionId}.`
        );
        summary.held += 1;
        continue;
      }

      // One bad record must not stop the pass or throw into the shared run.
      payload.logger.error(
        { err: error, winnerId: winner.id },
        "[giveaway] could not reconcile an in-progress prize"
      );
    }
  }

  return summary;
}
