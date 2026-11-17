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
   * The aggregate version as a decimal string. For refunds this is merely
   * recorded in `refundVersion`; refund money is deduplicated by refund id, not
   * by a version, because every refund aggregate has its own version 1.
   */
  orderVersion?: string;
  /** The signed order amount in minor units, when the event carries it. */
  amountMinor?: number;
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

/** The existing activity's point value, or null when it has not been written. */
async function findActivityPoint(
  payload: BasePayload,
  providerRef: string
): Promise<number | null> {
  const { docs } = await payload.find({
    collection: "activities",
    where: { providerRef: { equals: providerRef } },
    limit: 1,
    depth: 0,
  });
  const row = docs[0];
  return row ? Number(row.point ?? 0) : null;
}

async function hasActivity(
  payload: BasePayload,
  providerRef: string
): Promise<boolean> {
  return (await findActivityPoint(payload, providerRef)) !== null;
}

async function reconcileAward(
  payload: BasePayload,
  order: TicketOrder,
  points: number
): Promise<void> {
  if (points !== (order.pointsAwarded ?? 0)) {
    await payload.update({
      collection: "ticket-orders",
      id: order.id,
      data: { pointsAwarded: points },
    });
  }
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
  const existing = await findActivityPoint(payload, providerRef);
  if (existing !== null) {
    // A previous attempt created the activity but did not stamp the row; the
    // activity is the source of truth for what was actually paid.
    await reconcileAward(payload, order, existing);
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
      // The other writer's activity may have landed without its row update.
      const paid = await findActivityPoint(payload, providerRef);
      if (paid !== null) {
        await reconcileAward(payload, order, paid);
      }
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

async function findOrderRow(payload: BasePayload, reference: string) {
  const { docs } = await payload.find({
    collection: "ticket-orders",
    where: { reference: { equals: reference } },
    limit: 1,
    depth: 0,
  });
  return docs[0] ?? null;
}

function orderPatch(
  input: OrderStateInput,
  isRefund: boolean,
  nextRefunded: number | undefined
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    state: input.state,
    lastSyncedAt: new Date().toISOString(),
  };
  if (input.orderVersion !== undefined) {
    data[isRefund ? "refundVersion" : "orderVersion"] = input.orderVersion;
  }
  // The signed amount is only the order total on a paid transition, and only
  // when it is a real amount: a cancellation carrying 0 must not wipe it.
  if (
    !isRefund &&
    input.state === "paid" &&
    typeof input.amountMinor === "number" &&
    Number.isSafeInteger(input.amountMinor) &&
    input.amountMinor > 0
  ) {
    data.amountMinor = input.amountMinor;
  }
  if (nextRefunded !== undefined) {
    data.refundedMinor = nextRefunded;
  }
  return data;
}

/** Take back the share of a refund that arrived before there was an award. */
async function reversePreAwardRefund(
  payload: BasePayload,
  order: TicketOrder,
  awarded: number | null
): Promise<void> {
  if (!awarded || awarded <= 0) {
    return;
  }
  if ((order.refundedMinor ?? 0) <= 0) {
    return;
  }
  await reverseEventTicketPoints(payload, {
    ...order,
    // The row's real award, not a recalculation: a later paid transition can
    // raise the total, but the reversal can only take back what was paid.
    pointsAwarded: awarded,
    // The original refund id was not kept on the row; this deterministic ref
    // covers the cumulative pre-award refund once.
    refundId: "after-award",
  });
}

/** Award, then take back any refund that was recorded before the award. */
async function payOrder(
  payload: BasePayload,
  order: TicketOrder,
  reference: string,
  reversePreAward: boolean
): Promise<void> {
  const award = await awardEventTicketPoints(payload, order);
  if (award === "skipped" || !reversePreAward) {
    return;
  }
  // Read back the real award: a duplicate may have reconciled a different
  // (earlier) amount than this event would pay.
  const fresh = await findOrderRow(payload, reference);
  await reversePreAwardRefund(payload, order, fresh?.pointsAwarded ?? null);
}

/** All decisions for one row; kept apart so the lock body stays readable. */
async function applyRow(
  payload: BasePayload,
  row: TicketOrder,
  input: OrderStateInput,
  isRefund: boolean
): Promise<"applied" | "ignored"> {
  const storedVersion = isRefund ? row.refundVersion : row.orderVersion;
  if (
    !isRefund &&
    input.orderVersion !== undefined &&
    storedVersion &&
    !isNewer(input.orderVersion, storedVersion)
  ) {
    return "ignored";
  }

  // The signed order amount beats the shelf price the row was created with.
  const order = { ...row, amountMinor: input.amountMinor ?? row.amountMinor };
  const storedRefunded = row.refundedMinor ?? 0;
  const nextRefunded = isRefund
    ? Math.max(storedRefunded, input.refundedMinor ?? storedRefunded)
    : undefined;

  const refundRef =
    isRefund && input.refundId
      ? `shows:refund:${input.reference}:${input.refundId}`
      : null;
  const duplicateRefund = refundRef
    ? await hasActivity(payload, refundRef)
    : false;

  if (input.state === "paid") {
    await payOrder(payload, order, input.reference, !isRefund);
  }
  if (isRefund) {
    await reverseEventTicketPoints(payload, {
      ...order,
      refundedMinor: nextRefunded,
      refundId: input.refundId,
    });
  }

  const refundChanged =
    nextRefunded !== undefined && nextRefunded !== storedRefunded;
  const orderChanged =
    row.state !== input.state ||
    (input.orderVersion !== undefined && input.orderVersion !== storedVersion);
  if (duplicateRefund && !(refundChanged || orderChanged)) {
    return "ignored";
  }

  await payload.update({
    collection: "ticket-orders",
    id: row.id,
    data: orderPatch(input, isRefund, nextRefunded),
  });
  return "applied";
}

/**
 * Apply one Shows event to its order row, then run the points it implies.
 *
 * An unknown reference is `failed` so the handler can ask for a retry; an
 * order event no newer than what is stored is `ignored`. Refunds are not
 * version-gated: each refund aggregate starts at version 1, so the refund id
 * is the dedupe key and `refundedMinor` only ever moves forward. The row is
 * written after the side effect, so a crash between the two is replayed rather
 * than skipped.
 */
export async function applyOrderState(
  payload: BasePayload,
  input: OrderStateInput
): Promise<"applied" | "ignored" | "failed"> {
  const isRefund =
    input.refundId !== undefined || input.refundedMinor !== undefined;

  // Refund versions are informational; only order versions order events.
  if (
    !isRefund &&
    input.orderVersion !== undefined &&
    !isDecimal(input.orderVersion)
  ) {
    return "failed";
  }

  return await withKeyedLock(`ticket-order:${input.reference}`, async () => {
    const row = await findOrderRow(payload, input.reference);
    if (!row) {
      return "failed";
    }
    return await applyRow(payload, row, input, isRefund);
  });
}
