import type { BasePayload } from "payload";

import {
  ADDRESS_FULFILMENT_TYPES,
  CLAIM_WINDOW_DAYS,
  type FulfilmentStatus,
  type FulfilmentType,
  PHONE_FULFILMENT_TYPES,
} from "../../collections/giveaway/constants";

/** Milliseconds in the claim window. */
const CLAIM_WINDOW_MS = CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function claimDeadlineFor(selectedAt: Date | string): string {
  const from =
    typeof selectedAt === "string" ? new Date(selectedAt) : selectedAt;
  return new Date(from.getTime() + CLAIM_WINDOW_MS).toISOString();
}

export type ClaimWindow =
  | { open: true }
  | { open: false; reason: "expired" | "superseded"; message: string };

/**
 * Whether a prize can still be claimed.
 *
 * Two independent closers, and the earlier one wins. The fourteen days are the
 * ordinary deadline. The other is the rule the app owner settled: once a
 * later giveaway exists, prizes from earlier ones are closed regardless of
 * how much of the fortnight is left — a giveaway that has been superseded is
 * finished, and leaving its prizes claimable would let unclaimed stock trail
 * across rounds indefinitely.
 *
 * `laterGiveawayExists` is passed in rather than queried here so a caller
 * expiring hundreds of winners does it with one query, not one per row.
 */
export function claimWindowFor(
  winner: { claimDeadline?: string | null; selectedAt?: string | null },
  {
    laterGiveawayExists,
    now = new Date(),
  }: {
    laterGiveawayExists: boolean;
    now?: Date;
  }
): ClaimWindow {
  if (laterGiveawayExists) {
    return {
      open: false,
      reason: "superseded",
      message:
        "This prize can no longer be claimed — a new giveaway has already started.",
    };
  }

  const deadline = winner.claimDeadline
    ? new Date(winner.claimDeadline)
    : winner.selectedAt
      ? new Date(claimDeadlineFor(winner.selectedAt))
      : null;

  if (deadline && now.getTime() > deadline.getTime()) {
    return {
      open: false,
      reason: "expired",
      message: `The ${CLAIM_WINDOW_DAYS}-day claim window for this prize has closed.`,
    };
  }

  return { open: true };
}

/** What the winner must supply for this kind of prize. */
export function claimRequirements(
  type: FulfilmentType,
  { requiresVerification = false }: { requiresVerification?: boolean } = {}
): {
  needsPhone: boolean;
  needsAddress: boolean;
  needsVerification: boolean;
  instant: boolean;
} {
  return {
    needsPhone: PHONE_FULFILMENT_TYPES.includes(type),
    needsAddress: ADDRESS_FULFILMENT_TYPES.includes(type),
    needsVerification: requiresVerification,
    // Points are the only prize the platform can settle by itself the instant
    // it is claimed; everything else waits on a provider or a person. A prize
    // gated on verification is never instant, whatever its type.
    instant: type === "points" && !requiresVerification,
  };
}

/**
 * The fulfilment state a prize enters the moment it is claimed.
 *
 * Verification deliberately gates delivery, not the claim itself. Claiming is
 * what stops the fourteen-day clock, so requiring identity first would mean a
 * winner who cannot finish verification in time loses a prize they legitimately
 * won. This way the claim is secured immediately and the dispatch waits.
 */
export function fulfilmentStateAfterClaim(
  requirements: ReturnType<typeof claimRequirements>,
  currentStatus: string | null | undefined
): FulfilmentStatus | null {
  // A held prize stays held: releasing it is the administrator's call (§22.8).
  if (currentStatus === "on_hold") {
    return null;
  }
  if (requirements.needsVerification) {
    return "awaiting_verification";
  }
  return requirements.instant ? "fulfilled" : "pending";
}

/**
 * Whether any giveaway has started after the one a prize came from.
 *
 * "Started" means it exists and has left `draft` — an active giveaway has
 * superseded its predecessor even if its own draw has not run yet.
 */
export async function hasLaterGiveaway(
  payload: BasePayload,
  giveawayStartDate: string
): Promise<boolean> {
  const later = await payload.find({
    collection: "giveaways",
    where: {
      and: [
        { startDate: { greater_than: giveawayStartDate } },
        { status: { not_equals: "draft" } },
        { status: { not_equals: "cancelled" } },
      ],
    },
    limit: 1,
    pagination: false,
    depth: 0,
  });

  return later.docs.length > 0;
}

/**
 * Mark every unclaimed prize whose window has closed as `expired` (§21).
 *
 * Runs from the scheduled task. Expiry is deliberately a stored state rather
 * than something derived on read: an expired prize is a business event that
 * reports and fulfilment both need to see, and deriving it would mean every
 * reader reimplementing the same two rules.
 *
 * Fulfilment is cancelled alongside the claim, because an unclaimed prize that
 * has expired must not still be sitting in someone's dispatch queue.
 */
export async function expireLapsedClaims(
  payload: BasePayload,
  { now = new Date() }: { now?: Date } = {}
): Promise<number> {
  const unclaimed = await payload.find({
    collection: "giveaway-winners",
    where: { claimStatus: { equals: "unclaimed" } },
    pagination: false,
    depth: 1,
  });

  if (unclaimed.docs.length === 0) {
    return 0;
  }

  // One lookup per giveaway rather than per winner.
  const supersededByGiveaway = new Map<string, boolean>();
  let expired = 0;

  for (const winner of unclaimed.docs) {
    const giveaway = winner.giveaway;
    const giveawayId =
      typeof giveaway === "object" && giveaway !== null
        ? String(giveaway.id)
        : String(giveaway);

    if (!supersededByGiveaway.has(giveawayId)) {
      const startDate =
        typeof giveaway === "object" && giveaway !== null
          ? (giveaway.startDate as string)
          : null;

      supersededByGiveaway.set(
        giveawayId,
        startDate ? await hasLaterGiveaway(payload, startDate) : false
      );
    }

    const window = claimWindowFor(winner, {
      laterGiveawayExists: supersededByGiveaway.get(giveawayId) ?? false,
      now,
    });

    if (window.open) {
      continue;
    }

    await payload.update({
      collection: "giveaway-winners",
      id: winner.id,
      data: {
        claimStatus: "expired",
        fulfilmentStatus: "cancelled",
        reviewNote: window.message,
      },
    });

    expired += 1;
  }

  return expired;
}
