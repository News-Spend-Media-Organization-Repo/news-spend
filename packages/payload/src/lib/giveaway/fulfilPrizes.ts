import type { BasePayload } from "payload";

import { DEFAULT_GIVEAWAY_COUNTRY } from "../../collections/giveaway/constants";
import {
  ReloadlyClient,
  ReloadlyError,
  reloadlyConfigFromEnv,
} from "./reloadly";

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
  operatorId?: number;
  operatorName?: string;
  localAmount?: number;
}) => Promise<unknown>;

/**
 * Pay out claimed airtime and data prizes (spec §15).
 *
 * Only touches winners whose prize is delivered by the provider and whose
 * fulfilment is `pending` — a prize on hold, awaiting verification, or already
 * fulfilled is deliberately out of scope, so the states that stop a dispatch
 * keep stopping it.
 *
 * Never throws. This runs inside the scheduled task alongside the draw, and a
 * provider being unreachable must not take down the draw that shares the run.
 */
export async function fulfilPendingPrizes(
  payload: BasePayload,
  {
    client,
    limit = FULFILMENT_BATCH_SIZE,
  }: { client?: ReloadlyClient; limit?: number } = {}
): Promise<FulfilmentSummary> {
  const summary: FulfilmentSummary = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  const resolved = client ?? defaultClient(payload);
  if (!resolved) {
    return summary;
  }

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

    // Anything the provider does not deliver is somebody else's job.
    if (!(type === "airtime" || type === "data")) {
      continue;
    }

    summary.attempted += 1;
    const outcome = await fulfilOne(payload, resolved, winner);

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

function defaultClient(payload: BasePayload): ReloadlyClient | null {
  const config = reloadlyConfigFromEnv();

  if (!config) {
    payload.logger.warn(
      "[giveaway] Reloadly is not configured — airtime and data prizes will wait"
    );
    return null;
  }

  return new ReloadlyClient(config);
}

type Outcome = "sent" | "failed" | "skipped";

async function fulfilOne(
  payload: BasePayload,
  client: ReloadlyClient,
  winner: Record<string, any>
): Promise<Outcome> {
  const prize = winner.prize as Record<string, any>;
  const phone = (winner.claimPhone as string | null)?.trim();
  const winnerId = String(winner.id);

  const record: RecordAttempt = (data) =>
    payload
      .create({
        collection: "giveaway-fulfilment-attempts",
        data: {
          winner: winnerId,
          provider: "reloadly",
          environment: client.isSandbox ? "sandbox" : "live",
          providerReference: winnerId,
          recipientPhone: phone,
          attemptedAt: new Date().toISOString(),
          ...data,
        },
      })
      .catch((error) => {
        // A lost log entry must not stop a payout that otherwise worked.
        payload.logger.error(
          { err: error, winnerId },
          "[giveaway] could not write a fulfilment attempt"
        );
      });

  if (!phone) {
    await hold(payload, winnerId, "No phone number was captured at claim.");
    await record({ outcome: "skipped", error: "no phone number" });
    return "skipped";
  }

  /**
   * A data prize needs a specific bundle, not an amount. Networks sell fixed
   * plans whose descriptions do not map onto a prize name — ₦600 buys "2.5GB
   * 2-Day" on one network and something else on another — so the operator and
   * amount have to be chosen by a person and stored on the prize. Until they
   * are, the prize waits rather than guessing.
   */
  const configuredOperator = prize?.reloadlyOperatorId as number | undefined;
  const isData = prize?.fulfilmentType === "data";

  if (isData && !configuredOperator) {
    await record({
      outcome: "skipped",
      error: "data prize has no Reloadly bundle configured",
    });
    return "skipped";
  }

  const localAmount = Number(
    prize?.reloadlyLocalAmount ?? prize?.valueNaira ?? 0
  );

  if (!(localAmount > 0)) {
    await hold(payload, winnerId, "Prize has no value to send.");
    await record({ outcome: "skipped", error: "no amount" });
    return "skipped";
  }

  try {
    const operator = configuredOperator
      ? { operatorId: configuredOperator, name: "" }
      : await client.detectOperator(phone, DEFAULT_GIVEAWAY_COUNTRY);

    const result = await client.topup({
      operatorId: operator.operatorId,
      localAmount,
      phone,
      countryCode: DEFAULT_GIVEAWAY_COUNTRY,
      customIdentifier: winnerId,
    });

    await payload.update({
      collection: "giveaway-winners",
      id: winnerId,
      data: {
        fulfilmentStatus: "fulfilled",
        fulfilledAt: new Date().toISOString(),
      },
    });

    await record({
      outcome: "sent",
      providerTransactionId: String(result.transactionId ?? ""),
      operatorId: operator.operatorId,
      operatorName: result.operatorName ?? operator.name,
      localAmount,
    });

    return "sent";
  } catch (error) {
    return await handleFailure(payload, winnerId, error, record, localAmount);
  }
}

async function handleFailure(
  payload: BasePayload,
  winnerId: string,
  error: unknown,
  record: RecordAttempt,
  localAmount: number
): Promise<Outcome> {
  const message = error instanceof Error ? error.message : "Unknown error";

  /**
   * The provider recognised the identifier, which means the money already
   * went out on an earlier pass that died before recording it. Marking it
   * fulfilled is the correct reading — the alternative is a prize that looks
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
    await record({ outcome: "already_sent", localAmount, error: message });
    return "sent";
  }

  const retryable = error instanceof ReloadlyError ? error.retryable : true;

  if (!retryable) {
    await hold(payload, winnerId, `Provider rejected the payout: ${message}`);
    await record({ outcome: "permanent_failure", localAmount, error: message });
    return "failed";
  }

  const attempts = await payload.count({
    collection: "giveaway-fulfilment-attempts",
    where: {
      and: [
        { winner: { equals: winnerId } },
        { outcome: { equals: "retryable_failure" } },
      ],
    },
  });

  // Counting the attempt about to be written, not just the ones before it.
  if (attempts.totalDocs + 1 >= MAX_RETRYABLE_ATTEMPTS) {
    await hold(
      payload,
      winnerId,
      `Payout failed ${attempts.totalDocs + 1} times. Last error: ${message}`
    );
  }

  await record({ outcome: "retryable_failure", localAmount, error: message });
  return "failed";
}

/** Take a prize out of the queue and put it in front of a person. */
function hold(payload: BasePayload, winnerId: string, reason: string) {
  return payload.update({
    collection: "giveaway-winners",
    id: winnerId,
    data: { fulfilmentStatus: "on_hold", reviewNote: reason },
  });
}
