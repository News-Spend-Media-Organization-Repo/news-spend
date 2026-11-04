import type { BasePayload } from "payload";

import {
  type AttemptContext,
  attemptRecorder,
  defaultReloadlyClient,
  hold,
} from "./fulfilPrizes";
import { sendGiftCardEmail } from "./giftCardEmail";
import {
  applyProviderVerdict,
  latestProviderTransactionId,
} from "./providerVerdict";
import { type ReloadlyClient, ReloadlyError } from "./reloadly";
import {
  type GiftCardTransaction,
  type ReloadlyGiftCardClient,
  redeemableGiftCard,
  reloadlyGiftCardClientFromEnv,
} from "./reloadlyGiftCards";

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
  {
    client,
    giftCardClient,
    limit,
  }: {
    client?: ReloadlyClient;
    giftCardClient?: ReloadlyGiftCardClient;
    limit?: number;
  } = {}
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

  const resolvedGiftCards = giftCardClient ?? reloadlyGiftCardClientFromEnv();

  const pending = await payload.find({
    collection: "giveaway-winners",
    where: { fulfilmentStatus: { equals: "in_progress" } },
    limit,
    pagination: false,
    depth: 1,
  });

  // Compared in code rather than in the query: it is one comparison, and it
  // keeps the pass easy to test.
  const cutoff = Date.now() - STALE_AFTER_MS;

  for (const winner of pending.docs) {
    if (new Date(winner.updatedAt).getTime() > cutoff) {
      continue;
    }

    summary.checked += 1;

    const prize = winner.prize;
    const type =
      typeof prize === "object" && prize !== null
        ? prize.fulfilmentType
        : undefined;

    // Gift cards settle through their own client; falling through to the
    // top-up path would ask the airtime API about a card transaction.
    if (type === "gift_card") {
      if (resolvedGiftCards) {
        try {
          const outcome = await reconcileGiftCard(
            payload,
            resolvedGiftCards,
            winner
          );
          summary[outcome] += 1;
        } catch (error) {
          payload.logger.error(
            { err: error, winnerId: winner.id },
            "[giveaway] could not reconcile an in-progress gift card prize"
          );
        }
      }
      continue;
    }

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

      const found = latestProviderTransactionId(attempts.docs);

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

      /**
       * One rule for both settle paths: the sweep and the webhook hand the same
       * verdict to the same function, so what the provider says moves a prize
       * identically however we heard it. `localAmount: 0` is what this row has
       * always recorded — the sweep is settling an attempt, it is not reading
       * an amount.
       */
      const outcome = await applyProviderVerdict(
        payload,
        {
          winnerId: String(winner.id),
          environment: resolved.isSandbox ? "sandbox" : "live",
          phone: winner.claimPhone,
          currentStatus: winner.fulfilmentStatus,
        },
        {
          status,
          transactionId,
          localAmount: 0,
          message: `Provider reported ${status}`,
        }
      );

      if (outcome !== "unchanged") {
        summary[outcome] += 1;
      }
    } catch (error) {
      if (error instanceof ReloadlyError && error.status === 404) {
        // Our record says we sent a transaction and the provider says it has
        // never heard of it: two statements that disagree about money, so a
        // person decides. Re-queueing would be a guess with a payout behind
        // it, and re-reading it would loop forever.
        try {
          await hold(
            payload,
            String(winner.id),
            `Reloadly does not recognise transaction ${transactionId}.`
          );
          summary.held += 1;
        } catch (holdError) {
          /**
           * A hold that cannot be written leaves the prize `in_progress`, and
           * the next pass sees the same 404 and tries again. Failing the whole
           * run over it would stop every other winner from settling.
           */
          payload.logger.error(
            { err: holdError, winnerId: winner.id },
            "[giveaway] could not hold a payout the provider does not recognise"
          );
        }
      } else {
        // One bad record must not stop the pass or throw into the shared run.
        payload.logger.error(
          { err: error, winnerId: winner.id },
          "[giveaway] could not reconcile an in-progress prize"
        );
      }
    }
  }

  return summary;
}

type GiftCardOutcome = "fulfilled" | "requeued" | "held";

/**
 * Settle one gift card prize the provider has finished with (spec 15).
 *
 * The dispatch writes `giftCardTransactionId` before any status check or code
 * fetch, so an interrupted run resumes at `getTransaction` here rather than
 * ordering a second card. A prize with no recorded id is looked up by its own
 * identifier, and one with neither was never ordered: it goes back to the
 * queue, where the sweep re-orders with the same key and cannot buy twice.
 *
 * The three terminal answers mirror the dispatch: a failed order holds, a
 * still-settling order re-queues, and a successful order settles with the code.
 * A 404 means our record and the provider's disagree about the money, so a
 * person decides.
 */
async function reconcileGiftCard(
  payload: BasePayload,
  client: ReloadlyGiftCardClient,
  winner: Record<string, any>
): Promise<GiftCardOutcome> {
  const prize = winner.prize as Record<string, any> | null | undefined;
  const winnerId = String(winner.id);
  const identifier = `gift-card:${winnerId}`;
  const productName = String(prize?.reloadlyGiftCardProductName ?? "");

  const ctx: AttemptContext = {
    winnerId,
    environment: client.isSandbox ? "sandbox" : "live",
  };
  const record = attemptRecorder(payload, ctx);

  let transactionId: string | number | undefined = winner.giftCardTransactionId
    ? String(winner.giftCardTransactionId)
    : undefined;

  if (!transactionId) {
    const found = await client.findTransaction(identifier);
    if (found) {
      transactionId = found.transactionId;
    }
  }

  if (!transactionId) {
    // The run died before ordering. The sweep re-orders with the same key, so
    // it cannot buy twice.
    await payload.update({
      collection: "giveaway-winners",
      id: winnerId,
      data: { fulfilmentStatus: "pending" },
    });
    return "requeued";
  }

  let transaction: GiftCardTransaction;
  try {
    transaction = await client.getTransaction(transactionId);
  } catch (error) {
    if (error instanceof ReloadlyError && error.status === 404) {
      await hold(
        payload,
        winnerId,
        `Reloadly does not recognise gift card transaction ${transactionId}.`
      );
      return "held";
    }
    throw error;
  }

  if (
    transaction.status === "FAILED" ||
    transaction.status === "REVERSED" ||
    transaction.status === "CANCELLED"
  ) {
    await hold(
      payload,
      winnerId,
      `Gift card order ${transaction.status.toLowerCase()}.`
    );
    return "held";
  }

  if (transaction.status !== "SUCCESSFUL") {
    await payload.update({
      collection: "giveaway-winners",
      id: winnerId,
      data: { fulfilmentStatus: "pending" },
    });
    return "requeued";
  }

  const issued = await client.getCode(transaction.transactionId);
  const { code: giftCardCode, pin: giftCardPin } = redeemableGiftCard(issued);

  await payload.update({
    collection: "giveaway-winners",
    id: winnerId,
    data: {
      giftCardCode,
      giftCardPin,
      giftCardRedemptionUrl: issued.redemptionUrl ?? null,
      giftCardInstructions: prize?.reloadlyGiftCardInstructions ?? null,
      fulfilmentStatus: "fulfilled",
      fulfilledAt: new Date().toISOString(),
    },
  });

  await record({
    outcome: "already_sent",
    providerReference: identifier,
    providerTransactionId: String(transaction.transactionId),
    operatorName: productName,
    localAmount: transaction.amount ?? 0,
  });

  // The same winner's copy the dispatch sends, so a recovered card is not a
  // silent delivery. A missing email or a failed send leaves the prize
  // fulfilled with no timestamp, exactly as in the dispatch path.
  const email =
    typeof winner.user?.email === "string" ? winner.user.email.trim() : "";
  if (prize?.emailGiftCardCode !== false && email !== "") {
    const sent = await sendGiftCardEmail(payload, {
      to: email,
      winnerName: winner.claimRecipientName ?? null,
      prizeName: String(winner.prizeName ?? "A giveaway prize"),
      code: giftCardCode,
      pin: giftCardPin,
      redemptionUrl: issued.redemptionUrl ?? null,
      instructions: prize?.reloadlyGiftCardInstructions ?? null,
    });
    if (sent) {
      await payload
        .update({
          collection: "giveaway-winners",
          id: winnerId,
          data: { giftCardEmailSentAt: new Date().toISOString() },
        })
        .catch((error) => {
          payload.logger.error(
            { err: error, winnerId },
            "[giveaway] could not record the gift card email timestamp"
          );
        });
    }
  }

  return "fulfilled";
}
