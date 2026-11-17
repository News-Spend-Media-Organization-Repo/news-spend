import type { TicketOrder } from "@news-spend-media/payload/types";
import type { BasePayload } from "payload";

import { isUniqueViolation } from "../router/survey/providerPoints";
import { withKeyedLock } from "./keyedLock";

/**
 * The ticket order state machine and its Dream Points.
 *
 * Shows owns the order, we own what a confirmed purchase pays. Two rules keep
 * money and points honest:
 *
 * - the purchase reference is the idempotency key, so a replayed webhook can
 *   never pay twice, and a refund can never take back more than was paid;
 * - every event version is compared over the whole decimal value, so version
 *   10 is newer than 9 rather than older because "1" sorts before "9".
 */

export type TicketOrderState =
  | "paid"
  | "expired"
  | "cancelled"
  | "refunded"
  | "failed";

export type OrderStateInput = {
  reference: string;
  state: TicketOrderState;
  /**
   * The aggregate version as a decimal string. For refunds this is the
   * refund's version and is stored in `refundVersion`; otherwise it is the
   * order's version and is stored in `orderVersion`.
   */
  orderVersion?: string;
  refundedMinor?: number;
  refundId?: string;
};

export type TicketOrderWithRefund = TicketOrder & { refundId?: string };

const POINTS_PER_THOUSAND = 30;
const MINOR_PER_THOUSAND = 100_000;
const MIN_AWARD = 50;
const MAX_AWARD = 600;
const PER_EVENT_LIMIT = 2;
const PER_EVENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const DECIMAL = /^\d+$/;

/** 30 points per ₦1,000, floored to ten, at least 50, at most 600. */
export function pointsFor(amountMinor: number): number {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return 0;
  }

  const raw = Math.floor(
    (amountMinor * POINTS_PER_THOUSAND) / MINOR_PER_THOUSAND
  );
  const floored = Math.floor(raw / 10) * 10;
  return Math.min(MAX_AWARD, Math.max(MIN_AWARD, floored));
}

function relationId(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

async function hasActivity(
  payload: BasePayload,
  providerRef: string
): Promise<boolean> {
  const { totalDocs } = await payload.count({
    collection: "activities",
    where: { providerRef: { equals: providerRef } },
  });
  return totalDocs > 0;
}

/**
 * Whether this user has already been paid for this event often enough. Run
 * before the award so a third ticket in the window pays nothing.
 */
async function paidOrdersForEvent(
  payload: BasePayload,
  order: TicketOrder
): Promise<number> {
  if (!order.eventId) {
    return 0;
  }

  const userId = relationId(order.user);
  if (!userId) {
    return 0;
  }

  const since = new Date(Date.now() - PER_EVENT_WINDOW_MS).toISOString();
  const { docs } = await payload.find({
    collection: "ticket-orders",
    where: {
      and: [
        { user: { equals: userId } },
        { eventId: { equals: order.eventId } },
        { state: { equals: "paid" } },
        { createdAt: { greater_than: since } },
      ],
    },
    limit: 100,
    depth: 0,
  });

  return docs.filter((row) => String(row.id) !== String(order.id)).length;
}

/**
 * Pay a confirmed purchase once. The purchase reference is the provider ref,
 * so the unique index decides a race and a replay is simply a duplicate.
 */
export async function awardEventTicketPoints(
  payload: BasePayload,
  order: TicketOrder
): Promise<"awarded" | "duplicate" | "skipped"> {
  const reference = order.reference;
  const amountMinor = order.amountMinor ?? 0;
  const refundedMinor = order.refundedMinor ?? 0;
  if (!reference || amountMinor <= 0) {
    return "skipped";
  }

  // A refund that arrived before the paid event means there is nothing to pay.
  if (refundedMinor >= amountMinor) {
    return "skipped";
  }

  const providerRef = `shows:order:${reference}`;
  if (await hasActivity(payload, providerRef)) {
    return "duplicate";
  }

  if ((await paidOrdersForEvent(payload, order)) >= PER_EVENT_LIMIT) {
    return "skipped";
  }

  const userId = relationId(order.user);
  const points = pointsFor(amountMinor);
  if (!userId || points <= 0) {
    return "skipped";
  }

  try {
    await payload.create({
      collection: "activities",
      data: {
        type: "point",
        point: points,
        action: "eventTicket",
        description: `${order.eventName ?? "Event"} ticket`,
        user: userId,
        providerRef,
        metadata: {
          source: "shows",
          reference,
          orderReference: order.orderReference ?? null,
        },
      },
    });
  } catch (error) {
    // Two instances can pass the read together; the unique index decides.
    if (isUniqueViolation(error)) {
      return "duplicate";
    }
    throw error;
  }

  await payload.update({
    collection: "ticket-orders",
    id: order.id,
    data: { pointsAwarded: points },
  });
  return "awarded";
}

/**
 * Take back the paid proportion of a refund. The running `pointsReversed`
 * total makes this safe to call again for the same refund, and the refund's
 * own provider ref stops a second reversal row being written.
 */
export async function reverseEventTicketPoints(
  payload: BasePayload,
  order: TicketOrderWithRefund
): Promise<"reversed" | "nothing_to_reverse"> {
  const reference = order.reference;
  const refundId = order.refundId;
  const awarded = order.pointsAwarded ?? 0;
  const amountMinor = order.amountMinor ?? 0;
  const refundedMinor = order.refundedMinor ?? 0;
  const reversed = order.pointsReversed ?? 0;
  if (!(reference && refundId) || awarded <= 0 || amountMinor <= 0) {
    return "nothing_to_reverse";
  }

  const target = Math.min(
    awarded,
    Math.floor((awarded * refundedMinor) / amountMinor)
  );
  const providerRef = `shows:refund:${reference}:${refundId}`;

  if (await hasActivity(payload, providerRef)) {
    // A retry after the activity was written: finish recording it, never pay
    // the same refund twice.
    if (target > reversed) {
      await payload.update({
        collection: "ticket-orders",
        id: order.id,
        data: { pointsReversed: target },
      });
    }
    return "nothing_to_reverse";
  }

  const points = target - reversed;
  if (points <= 0) {
    return "nothing_to_reverse";
  }

  const userId = relationId(order.user);
  if (!userId) {
    return "nothing_to_reverse";
  }

  try {
    await payload.create({
      collection: "activities",
      data: {
        type: "point",
        point: -points,
        action: "pointReversal",
        description: `${order.eventName ?? "Event"} ticket refund`,
        user: userId,
        providerRef,
        metadata: {
          source: "shows",
          reference,
          orderReference: order.orderReference ?? null,
          refundId,
        },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return "nothing_to_reverse";
    }
    throw error;
  }

  await payload.update({
    collection: "ticket-orders",
    id: order.id,
    data: { pointsReversed: target },
  });
  return "reversed";
}

function isDecimal(value: string): boolean {
  return DECIMAL.test(value);
}

/** `true` when `incoming` is newer than what the row already has. */
function isNewer(incoming: string, stored: string | null | undefined): boolean {
  if (!(stored && isDecimal(stored))) {
    return true;
  }
  return BigInt(incoming) > BigInt(stored);
}

/**
 * Apply one Shows event to its order row, then run the points it implies.
 *
 * An unknown reference is `failed` so the handler can ask for a retry; an
 * event no newer than what is stored is `ignored`. The row is written only
 * after the side effect, so a crash between the two is replayed rather than
 * skipped.
 */
export async function applyOrderState(
  payload: BasePayload,
  input: OrderStateInput
): Promise<"applied" | "ignored" | "failed"> {
  const { reference, orderVersion } = input;
  const isRefund =
    input.refundId !== undefined || input.refundedMinor !== undefined;

  if (orderVersion !== undefined && !isDecimal(orderVersion)) {
    return "failed";
  }

  return await withKeyedLock(`ticket-order:${reference}`, async () => {
    const { docs } = await payload.find({
      collection: "ticket-orders",
      where: { reference: { equals: reference } },
      limit: 1,
      depth: 0,
    });
    const row = docs[0];
    if (!row) {
      return "failed";
    }

    const storedVersion = isRefund ? row.refundVersion : row.orderVersion;
    if (
      orderVersion !== undefined &&
      storedVersion &&
      !isNewer(orderVersion, storedVersion)
    ) {
      return "ignored";
    }

    if (input.state === "paid") {
      await awardEventTicketPoints(payload, row);
    }

    if (isRefund) {
      await reverseEventTicketPoints(payload, {
        ...row,
        refundedMinor: input.refundedMinor ?? row.refundedMinor,
        refundId: input.refundId,
      });
    }

    await payload.update({
      collection: "ticket-orders",
      id: row.id,
      data: {
        state: input.state,
        ...(orderVersion === undefined
          ? {}
          : isRefund
            ? { refundVersion: orderVersion }
            : { orderVersion }),
        ...(input.refundedMinor === undefined
          ? {}
          : { refundedMinor: input.refundedMinor }),
        lastSyncedAt: new Date().toISOString(),
      },
    });

    return "applied";
  });
}
