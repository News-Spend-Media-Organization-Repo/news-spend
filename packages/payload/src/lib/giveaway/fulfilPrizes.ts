import { sql } from "@payloadcms/db-postgres/drizzle";
import type { BasePayload } from "payload";

import { DEFAULT_GIVEAWAY_COUNTRY } from "../../collections/giveaway/constants";
import { sendGiftCardEmail } from "./giftCardEmail";
import { notifyFulfilmentHold } from "./notifyFulfilmentHold";
import { notifyFulfilmentProblem } from "./notifyFulfilmentProblem";
import {
  ReloadlyClient,
  ReloadlyError,
  reloadlyConfigFromEnv,
} from "./reloadly";
import {
  type GiftCardOrder,
  type GiftCardProduct,
  type ReloadlyGiftCardClient,
  reloadlyGiftCardClientFromEnv,
} from "./reloadlyGiftCards";

/** How many payouts one pass will attempt. */
const FULFILMENT_BATCH_SIZE = 50;

/**
 * Retryable failures tolerated before a prize is handed to a human.
 *
 * A provider outage clears on its own within a few hourly passes. Something
 * still failing after this many is not transient, and leaving it in the queue
 * would retry it silently forever.
 */
const MAX_RETRYABLE_ATTEMPTS = 5;

export type FulfilmentSummary = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
};

type AttemptOutcome =
  | "sent"
  | "already_sent"
  | "retryable_failure"
  | "permanent_failure"
  | "skipped";

type RecordAttempt = (data: {
  outcome: AttemptOutcome;
  error?: string;
  providerTransactionId?: string;
  providerReference?: string;
  operatorId?: number;
  operatorName?: string;
  localAmount?: number;
}) => Promise<unknown>;

/** What {@link attemptRecorder} needs to know about the attempt it records. */
export type AttemptContext = {
  winnerId: string;
  environment: "sandbox" | "live";
  phone?: string | null;
};

/**
 * The single writer of fulfilment-attempt rows.
 *
 * Both the dispatch and the reconciliation pass append to this log, and this
 * row is what decides whether a retry may reuse its identifier, so a second
 * copy of the write — and of the swallow below — would be two rules that drift
 * the first time either is edited.
 *
 * `providerReference` is deliberately not part of the base: it identifies the
 * attempt being recorded and is not always known when the recorder is built.
 *
 * `throwOnWriteFailure` is off by default because a row-write failure must not
 * abort a sweep pass. The webhook settlement turns it on: there a 200 answer
 * suppresses the redelivery that would rewrite the row, so the loss has to
 * reach the handler.
 */
export function attemptRecorder(
  payload: BasePayload,
  ctx: AttemptContext,
  { throwOnWriteFailure = false }: { throwOnWriteFailure?: boolean } = {}
): RecordAttempt {
  return (data) =>
    payload
      .create({
        collection: "giveaway-fulfilment-attempts",
        data: {
          winner: ctx.winnerId,
          provider: "reloadly",
          environment: ctx.environment,
          recipientPhone: ctx.phone,
          attemptedAt: new Date().toISOString(),
          ...data,
        },
      })
      .catch((error) => {
        // A lost log entry must not stop a payout that otherwise worked.
        payload.logger.error(
          { err: error, winnerId: ctx.winnerId },
          "[giveaway] could not write a fulfilment attempt"
        );

        if (throwOnWriteFailure) {
          throw error;
        }
      });
}

/**
 * Pay out claimed airtime and data prizes (spec 15).
 *
 * Only touches winners whose prize is delivered by the provider and whose
 * fulfilment is `pending`, a prize on hold, awaiting verification, or already
 * fulfilled is deliberately out of scope, so the states that stop a dispatch
 * keep stopping it.
 *
 * Never throws. This runs inside the scheduled task alongside the draw, and a
 * provider being unreachable must not take down the draw that shares the run.
 */
export async function fulfilPendingPrizes(
  payload: BasePayload,
  options: {
    client?: ReloadlyClient;
    giftCardClient?: ReloadlyGiftCardClient;
    limit?: number;
  } = {}
): Promise<FulfilmentSummary> {
  const { client, giftCardClient, limit = FULFILMENT_BATCH_SIZE } = options;

  const summary: FulfilmentSummary = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  const resolved = client ?? defaultReloadlyClient(payload);
  if (!resolved) {
    return summary;
  }

  const resolvedGiftCards = giftCardClient ?? reloadlyGiftCardClientFromEnv();

  const pending = await payload.find({
    collection: "giveaway-winners",
    where: {
      and: [
        { claimStatus: { equals: "claimed" } },
        { fulfilmentStatus: { equals: "pending" } },
      ],
    },
    sort: "claimedAt",
    limit,
    pagination: false,
    depth: 1,
  });

  for (const winner of pending.docs) {
    const prize = winner.prize;
    const prizeDoc = typeof prize === "object" && prize !== null ? prize : null;
    const type = prizeDoc?.fulfilmentType;

    const isGiftCard =
      type === "gift_card" && Number(prizeDoc?.reloadlyGiftCardProductId) > 0;

    // Anything the provider does not deliver is somebody else's job. A gift
    // card counts only once a Reloadly product is configured; a legacy card
    // with no product stays a manual prize and is skipped silently.
    if (!(type === "airtime" || type === "data" || isGiftCard)) {
      continue;
    }

    // A configured gift card with no gift-card client must never fall through
    // to the airtime path, which would pay the wrong thing. Unreachable today
    // (both clients share one credential pair); skip rather than guess.
    if (isGiftCard && !resolvedGiftCards) {
      continue;
    }

    // Claimed before anything is sent. A runner that loses the race must not
    // count it, log it, or remember it: another process is paying it right now.
    if (!(await claimForFulfilment(payload, winner.id))) {
      continue;
    }

    summary.attempted += 1;

    const outcome =
      isGiftCard && resolvedGiftCards
        ? await fulfilGiftCard(payload, resolvedGiftCards, winner)
        : await fulfilOne(payload, resolved, winner);

    if (outcome === "sent") {
      summary.sent += 1;
    } else if (outcome === "skipped") {
      summary.skipped += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}

/**
 * Take exclusive ownership of a prize before paying it.
 *
 * The sweep reads `pending` prizes and then sends them, and the job queue runs
 * in more than one process: `jobs.autoRun` lives in the shared config, so the
 * CMS and the API server each sweep, and a rolling deploy briefly doubles that
 * again. Two runners that both read this prize would both pay it — and unlike
 * the report sweep, nothing downstream refuses the second payment, because the
 * identifier is now per attempt rather than per winner.
 *
 * A single conditional UPDATE is what closes it: Postgres serialises the row, so
 * exactly one runner sees it come back and the rest move on. `in_progress` is
 * also the state the app shows as "Sending now", so the claim does the job the
 * unconditional update used to do: it marks the attempt before making it, which
 * is what separates "queued" from "being sent right now" on the winner's own
 * screen, and a run that dies mid-dispatch leaves a visible `in_progress` the
 * next pass picks up rather than a prize that looks untouched.
 */
async function claimForFulfilment(
  payload: BasePayload,
  winnerId: string
): Promise<boolean> {
  try {
    const claimed = await payload.db.drizzle.execute(
      sql`UPDATE giveaway_winners
          SET fulfilment_status = 'in_progress', updated_at = now()
          WHERE id = ${winnerId} AND fulfilment_status = 'pending'
          RETURNING id`
    );

    const rows = (claimed as { rows?: unknown[] })?.rows ?? claimed;
    return Array.isArray(rows) ? rows.length > 0 : Boolean(rows);
  } catch (error) {
    payload.logger.error(
      { err: error, winnerId },
      "[giveaway] could not claim a prize for fulfilment"
    );
    return false;
  }
}

export function defaultReloadlyClient(
  payload: BasePayload
): ReloadlyClient | null {
  const config = reloadlyConfigFromEnv();

  if (!config) {
    payload.logger.warn(
      "[giveaway] Reloadly is not configured: airtime and data prizes will wait"
    );
    return null;
  }

  return new ReloadlyClient(config);
}

type Outcome = "sent" | "failed" | "skipped";

/**
 * The prize cannot be sent as configured, and no amount of retrying changes
 * that, held immediately rather than run through the provider's retry
 * classification, which has nothing to say about a decision made entirely on
 * this side.
 */
class UnresolvablePlanError extends Error {}

/**
 * Which network a detected operator belongs to, matched on its name.
 *
 * Deliberately not matched on `operatorId`. Reloadly's sandbox and live
 * catalogues are separate lists and an id that means "MTN Nigeria" in one is
 * not promised to mean anything in the other, so an id-based map silently
 * stops working the day the environment switches, and if an id happens to be
 * reused for a different network it resolves to the wrong one and sends an MTN
 * bundle to an Airtel SIM. The operator's name survives that switch.
 *
 * Matching a distinctive word rather than the full name, because the same
 * network appears as "MTN Nigeria" for airtime and "MTN Nigeria Data" for
 * bundles, and 9mobile still trades under its older names in some listings.
 */
const NETWORK_PATTERNS: { network: string; pattern: RegExp }[] = [
  { network: "mtn", pattern: /\bmtn\b/i },
  { network: "airtel", pattern: /\bairtel\b/i },
  { network: "glo", pattern: /\bglo\b/i },
  { network: "t2", pattern: /\b(t2|9\s*mobile|etisalat)\b/i },
];

/** The network family of a detected operator, or null if unrecognised. */
function networkOf(operatorName: string | undefined | null): string | null {
  if (!operatorName) {
    return null;
  }
  const matches = NETWORK_PATTERNS.filter((entry) =>
    entry.pattern.test(operatorName)
  );

  // Two matches means the name is ambiguous and picking either would be a
  // guess about somebody's payout. Treat it as unrecognised and hold.
  return matches.length === 1 ? matches[0].network : null;
}

async function fulfilOne(
  payload: BasePayload,
  client: ReloadlyClient,
  winner: Record<string, any>
): Promise<Outcome> {
  const prize = winner.prize as Record<string, any>;
  const phone = (winner.claimPhone as string | null)?.trim();
  const winnerId = String(winner.id);

  let identifier: string | null = null;

  const ctx: AttemptContext = {
    winnerId,
    environment: client.isSandbox ? "sandbox" : "live",
    phone,
  };
  const record = attemptRecorder(payload, ctx);

  if (!phone) {
    await hold(payload, winnerId, "No phone number was captured at claim.");
    await record({ outcome: "skipped", error: "no phone number" });
    return "skipped";
  }

  const isData = prize?.fulfilmentType === "data";
  let localAmount = 0;

  try {
    // Only a failure the provider told us about has spent its key. Filtering
    // on the transaction id is load-bearing: a failure without one is a
    // request whose outcome we never learned, and counting it would hand the
    // retry a fresh key for a payout that may already have gone out.
    const spentIdentifiers = await payload.count({
      collection: "giveaway-fulfilment-attempts",
      where: {
        and: [
          { winner: { equals: winnerId } },
          { providerTransactionId: { exists: true } },
        ],
      },
    });
    identifier = `${winnerId}:${spentIdentifiers.totalDocs + 1}`;

    const plan = isData
      ? await resolveDataPlan(client, prize, phone)
      : await resolveAirtimeTopup(client, prize, phone);
    localAmount = plan.localAmount;

    const result = await client.topup({
      operatorId: plan.operatorId,
      localAmount: plan.localAmount,
      phone,
      countryCode: DEFAULT_GIVEAWAY_COUNTRY,
      customIdentifier: identifier,
    });

    if (result.status === "SUCCESSFUL") {
      await payload.update({
        collection: "giveaway-winners",
        id: winnerId,
        data: {
          fulfilmentStatus: "fulfilled",
          fulfilledAt: new Date().toISOString(),
        },
      });
    }

    // The provider's body is asserted, not validated, so this is a real check:
    // the key count reads `exists: true` (IS NOT NULL, which an empty string
    // satisfies) while the reconciler requires a non-empty id — the two must
    // agree on what "we have an id" means, or a re-queue hands the retry a
    // fresh identifier for a transaction that may already exist.
    const transactionId =
      result.transactionId == null ? "" : String(result.transactionId).trim();

    await record({
      outcome: "sent",
      providerReference: identifier ?? undefined,
      ...(transactionId === "" ? {} : { providerTransactionId: transactionId }),
      operatorId: plan.operatorId,
      operatorName: result.operatorName ?? "",
      localAmount: plan.localAmount,
    });

    return "sent";
  } catch (error) {
    if (error instanceof UnresolvablePlanError) {
      await hold(payload, winnerId, error.message);
      await record({
        outcome: "skipped",
        providerReference: identifier ?? undefined,
        error: error.message,
      });
      return "skipped";
    }

    return await handleFailure(
      payload,
      ctx,
      error,
      record,
      localAmount,
      identifier ?? undefined
    );
  }
}

/**
 * Whether the prize's configured face value is still one the product sells.
 *
 * Checked before ordering so a product Reloadly has since repriced (or a value
 * captured against the wrong catalogue) holds as a configuration problem
 * instead of sending the provider a price it will reject.
 */
function validGiftCardDenomination(
  product: GiftCardProduct,
  unitPrice: number
): boolean {
  if (product.denominationType === "FIXED") {
    return (product.fixedRecipientDenominations ?? []).includes(unitPrice);
  }

  const min = product.minRecipientDenomination;
  const max = product.maxRecipientDenomination;
  return (min == null || unitPrice >= min) && (max == null || unitPrice <= max);
}

/**
 * Buy one gift card for a winner and store its code.
 *
 * The identifier is per winner, not per attempt, so a retry after a failed
 * code fetch is refused as a duplicate instead of buying a second card. The
 * transaction id is written before any status check or code fetch, which is
 * what lets the retry resume at `getTransaction` rather than ordering again.
 */
async function fulfilGiftCard(
  payload: BasePayload,
  client: ReloadlyGiftCardClient,
  winner: Record<string, any>
): Promise<Outcome> {
  const prize = winner.prize as Record<string, any>;
  const winnerId = String(winner.id);
  const identifier = `gift-card:${winnerId}`;
  const productId = Number(prize.reloadlyGiftCardProductId);
  const unitPrice = Number(prize.reloadlyGiftCardUnitPrice);
  const productName = String(prize.reloadlyGiftCardProductName ?? "");

  const ctx: AttemptContext = {
    winnerId,
    environment: client.isSandbox ? "sandbox" : "live",
  };
  const record = attemptRecorder(payload, ctx);

  let chargedAmount = 0;

  try {
    let transaction: GiftCardOrder;

    if (winner.giftCardTransactionId) {
      transaction = await client.getTransaction(winner.giftCardTransactionId);
    } else {
      // A prize configured against the other environment is a configuration
      // problem, caught before `getProduct` so it holds with a clear reason
      // rather than a misleading 404.
      const configuredEnv = prize.reloadlyGiftCardEnvironment;
      const currentEnv = client.isSandbox ? "sandbox" : "live";
      if (
        typeof configuredEnv === "string" &&
        configuredEnv.trim() !== "" &&
        configuredEnv !== currentEnv
      ) {
        await hold(
          payload,
          winnerId,
          `Gift card was configured in ${configuredEnv} but this client is ${currentEnv}.`
        );
        await record({
          outcome: "skipped",
          providerReference: identifier,
          error: "configured environment mismatch",
        });
        return "skipped";
      }

      let product: GiftCardProduct;
      try {
        product = await client.getProduct(productId);
      } catch (error) {
        if (error instanceof ReloadlyError && error.status === 404) {
          await hold(
            payload,
            winnerId,
            "Gift card is configured in a different Reloadly environment."
          );
          await record({
            outcome: "skipped",
            providerReference: identifier,
            error: "product not in current environment",
          });
          return "skipped";
        }
        throw error;
      }

      if (!validGiftCardDenomination(product, unitPrice)) {
        const message = "Gift card no longer offers that face value.";
        await hold(payload, winnerId, message);
        await record({
          outcome: "skipped",
          providerReference: identifier,
          error: message,
        });
        return "skipped";
      }

      try {
        transaction = await client.order({
          productId,
          unitPrice,
          customIdentifier: identifier,
        });
      } catch (error) {
        if (error instanceof ReloadlyError && error.isAlreadySent) {
          const existing = await client.findTransaction(identifier);
          if (!existing) {
            await hold(
              payload,
              winnerId,
              "Gift card was reported as already purchased but could not be found."
            );
            await record({
              outcome: "skipped",
              providerReference: identifier,
              error: "duplicate identifier unresolvable",
            });
            return "skipped";
          }
          transaction = existing;
        } else {
          throw error;
        }
      }

      // Written before any status check or code fetch, so an interrupted run
      // resumes here rather than buying a second card.
      await payload.update({
        collection: "giveaway-winners",
        id: winnerId,
        data: { giftCardTransactionId: String(transaction.transactionId) },
      });
    }

    chargedAmount = transaction.amount ?? 0;

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
      await record({
        outcome: "permanent_failure",
        providerReference: identifier,
        providerTransactionId: String(transaction.transactionId),
        operatorName: productName,
        localAmount: chargedAmount,
        error: `order ${transaction.status}`,
      });
      return "failed";
    }

    if (transaction.status !== "SUCCESSFUL") {
      throw new ReloadlyError(
        `Gift card order is ${transaction.status}; retrying.`,
        200,
        { status: transaction.status },
        true
      );
    }

    const issued = await client.getCode(transaction.transactionId);

    await payload.update({
      collection: "giveaway-winners",
      id: winnerId,
      data: {
        giftCardCode: issued.cardNumber,
        giftCardPin: issued.pinCode ?? null,
        giftCardRedemptionUrl: issued.redemptionUrl ?? null,
        giftCardInstructions: prize.reloadlyGiftCardInstructions ?? null,
        fulfilmentStatus: "fulfilled",
        fulfilledAt: new Date().toISOString(),
      },
    });

    await record({
      outcome: "sent",
      providerReference: identifier,
      providerTransactionId: String(transaction.transactionId),
      operatorName: productName,
      localAmount: chargedAmount,
    });

    // The winner's copy. `emailGiftCardCode` is on by default, so only an
    // explicit `false` (or a winner with no email address) skips it.
    const email =
      typeof winner.user?.email === "string" ? winner.user.email.trim() : "";
    if (prize.emailGiftCardCode !== false && email !== "") {
      const sent = await sendGiftCardEmail(payload, {
        to: email,
        winnerName: winner.claimRecipientName ?? null,
        prizeName: String(winner.prizeName ?? "A giveaway prize"),
        code: issued.cardNumber,
        pin: issued.pinCode ?? null,
        redemptionUrl: issued.redemptionUrl ?? null,
        instructions: prize.reloadlyGiftCardInstructions ?? null,
      });
      // A failed send leaves the prize fulfilled and the timestamp empty; the
      // write must not undo a prize that is already stored and recorded.
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

    return "sent";
  } catch (error) {
    return await handleFailure(
      payload,
      ctx,
      error,
      record,
      chargedAmount,
      identifier
    );
  }
}

/**
 * Airtime needs only an amount configured by a person: the network itself is
 * detected from the winner's phone number at send time, since airtime (unlike
 * data) is not locked to a specific carrier's own SIMs the same way.
 */
async function resolveAirtimeTopup(
  client: ReloadlyClient,
  prize: Record<string, any>,
  phone: string
): Promise<{ operatorId: number; localAmount: number }> {
  const localAmount = Number(
    prize?.reloadlyLocalAmount ?? prize?.valueNaira ?? 0
  );

  if (!(localAmount > 0)) {
    throw new UnresolvablePlanError("Prize has no value to send.");
  }

  const detected = await client.detectOperator(phone, DEFAULT_GIVEAWAY_COUNTRY);
  return { operatorId: detected.operatorId, localAmount };
}

/**
 * Match the winner's actual network to a data plan configured for it.
 *
 * A data bundle is provisioned by one specific network for that network's own
 * SIMs; an MTN bundle does nothing for an Airtel winner. So the winner's real
 * network is detected from their phone number, exactly as for airtime, and
 * then looked up against the rows a person configured on the prize. A network
 * with no configured row is held for review rather than sent a different
 * network's bundle, which would either silently fail or deliver nothing.
 */
async function resolveDataPlan(
  client: ReloadlyClient,
  prize: Record<string, any>,
  phone: string
): Promise<{ operatorId: number; operatorName: string; localAmount: number }> {
  const plans = (prize?.reloadlyDataPlans ?? []) as {
    network: string;
    reloadlyOperatorId: number;
    reloadlyLocalAmount: number;
  }[];

  if (plans.length === 0) {
    throw new UnresolvablePlanError(
      "Data prize has no Reloadly plans configured for any network."
    );
  }

  const detected = await client.detectOperator(phone, DEFAULT_GIVEAWAY_COUNTRY);
  const network = networkOf(detected.name);
  const plan = network ? plans.find((p) => p.network === network) : undefined;

  if (!plan) {
    throw new UnresolvablePlanError(
      `No data plan configured for the winner's network (${detected.name}).`
    );
  }

  return {
    operatorId: plan.reloadlyOperatorId,
    operatorName: detected.name,
    localAmount: plan.reloadlyLocalAmount,
  };
}

async function handleFailure(
  payload: BasePayload,
  ctx: AttemptContext,
  error: unknown,
  record: RecordAttempt,
  localAmount: number,
  providerReference?: string
): Promise<Outcome> {
  const { winnerId } = ctx;
  const message = error instanceof Error ? error.message : "Unknown error";

  /**
   * The provider recognised the identifier, which means the money already
   * went out on an earlier pass that died before recording it. Marking it
   * fulfilled is the correct reading: the alternative is a prize that looks
   * unpaid forever and a winner who has already been paid.
   */
  if (error instanceof ReloadlyError && error.isAlreadySent) {
    await payload.update({
      collection: "giveaway-winners",
      id: winnerId,
      data: {
        fulfilmentStatus: "fulfilled",
        fulfilledAt: new Date().toISOString(),
      },
    });
    await record({
      outcome: "already_sent",
      localAmount,
      error: message,
      ...(providerReference ? { providerReference } : {}),
    });
    return "sent";
  }

  const retryable = error instanceof ReloadlyError ? error.retryable : true;

  if (!retryable) {
    await hold(payload, winnerId, `Provider rejected the payout: ${message}`);
    await record({
      outcome: "permanent_failure",
      localAmount,
      error: message,
      ...(providerReference ? { providerReference } : {}),
    });
    return "failed";
  }

  await requeueOrHold(payload, ctx, localAmount, message, {
    providerReference,
  });
  return "failed";
}

/**
 * Put a failed payout back in the queue, or hand it to a person once it has
 * failed too often.
 *
 * Shared by the dispatch and the reconciliation pass so the cap is decided
 * once. The cap keeps counting *every* retryable failure, confirmed or not, so
 * a fault that never resolves still reaches a human.
 *
 * `providerReference` is the dispatch path's own identifier for the attempt,
 * and is recorded here for the same reason as on every other row: it is the
 * key that was spent, and it is what a person reads when asking whether a
 * request we never got an answer from did reach the provider. The
 * reconciliation pass deliberately passes none — it records the settlement of
 * an attempt, it is not reading a key back.
 *
 * `confirmedTransactionId` is the id of a failure the provider itself
 * reported. Recording it as `providerTransactionId` is what advances the
 * attempt key on the retry: a confirmed failure has spent its identifier, and
 * reusing it would be refused and read as "already paid" while the winner goes
 * unpaid.
 *
 * `throwOnWriteFailure` is forwarded to {@link attemptRecorder} and is off
 * everywhere but the webhook, whose 200 suppresses the redelivery that would
 * rewrite a lost row.
 */
export async function requeueOrHold(
  payload: BasePayload,
  ctx: AttemptContext,
  localAmount: number,
  message: string,
  opts: {
    providerReference?: string;
    confirmedTransactionId?: string;
    throwOnWriteFailure?: boolean;
  } = {}
): Promise<"pending" | "on_hold"> {
  const record = attemptRecorder(payload, ctx, {
    throwOnWriteFailure: opts.throwOnWriteFailure,
  });

  const attempts = await payload.count({
    collection: "giveaway-fulfilment-attempts",
    where: {
      and: [
        { winner: { equals: ctx.winnerId } },
        { outcome: { equals: "retryable_failure" } },
      ],
    },
  });

  // Counting the attempt about to be written, not just the ones before it.
  const capped = attempts.totalDocs + 1 >= MAX_RETRYABLE_ATTEMPTS;

  if (capped) {
    await hold(
      payload,
      ctx.winnerId,
      `Payout failed ${attempts.totalDocs + 1} times. Last error: ${message}`
    );
  } else {
    /**
     * Put it back in the queue.
     *
     * `in_progress` is a claim, not a label: the sweep selects `pending`, so a
     * prize left `in_progress` after a failure is invisible to every future
     * pass, retryable in name and abandoned in fact. This is the line that
     * makes the retry real, and it must stay paired with the claim above.
     */
    await payload.update({
      collection: "giveaway-winners",
      id: ctx.winnerId,
      data: { fulfilmentStatus: "pending" },
    });
  }

  await record({
    outcome: "retryable_failure",
    localAmount,
    error: message,
    ...(opts.providerReference
      ? { providerReference: opts.providerReference }
      : {}),
    ...(opts.confirmedTransactionId
      ? { providerTransactionId: opts.confirmedTransactionId }
      : {}),
  });

  return capped ? "on_hold" : "pending";
}

/**
 * Take a prize out of the queue and put it in front of a person.
 *
 * Both the administrator and the winner are told. Only the administrator was,
 * until now, and the winner is the one who may be able to fix the cause: a
 * mistyped phone number is the commonest reason a payout is rejected, and it
 * is invisible from the inside.
 */
export async function hold(
  payload: BasePayload,
  winnerId: string,
  reason: string
) {
  await payload.update({
    collection: "giveaway-winners",
    id: winnerId,
    data: { fulfilmentStatus: "on_hold", reviewNote: reason },
  });

  // Never throws; a notification failure must not undo a handled hold.
  await notifyFulfilmentProblem(payload, winnerId);
  await notifyFulfilmentHold(payload, winnerId, reason);
}
