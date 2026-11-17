import { describe, expect, it } from "bun:test";

import { createFakePayload } from "../test-utils";
import { applyOrderState, pointsFor } from "./ticketOrders";

/**
 * The order state machine and its Dream Points.
 *
 * The brief fixes the award at 30 points per ₦1,000 (floored to 10, at least
 * 50, at most 600) and makes the purchase reference the idempotency key, so a
 * replayed webhook can never pay twice. Refunds give back the same proportion
 * of what was paid, never more.
 */

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    user: "user-1",
    reference: "ref_1",
    state: "pending",
    eventId: "event-1",
    eventName: "Lagos Live",
    amountMinor: 850_000,
    refundedMinor: 0,
    pointsAwarded: 0,
    pointsReversed: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function activities(
  payload: ReturnType<typeof createFakePayload>,
  action: string
) {
  return payload.docs("activities").filter((row) => row.action === action);
}

describe("pointsFor", () => {
  it("pays nothing for nothing", () => {
    expect(pointsFor(0)).toBe(0);
    expect(pointsFor(-1)).toBe(0);
  });

  it("pays the 50-point minimum below one thousand naira", () => {
    expect(pointsFor(499)).toBe(50);
    expect(pointsFor(1000)).toBe(50);
  });

  it("pays 30 per ₦1,000, floored to ten", () => {
    // ₦8,500 → 255 raw, floored to 250.
    expect(pointsFor(850_000)).toBe(250);
  });

  it("caps at 600 points", () => {
    // ₦30,000 → 900 raw, capped.
    expect(pointsFor(3_000_000)).toBe(600);
  });
});

describe("applyOrderState", () => {
  it("awards once for a replayed paid event", async () => {
    const payload = createFakePayload({
      collections: { "ticket-orders": [order()] },
    });
    const paid = {
      reference: "ref_1",
      state: "paid" as const,
      orderVersion: "1",
    };

    await expect(applyOrderState(payload as never, paid)).resolves.toBe(
      "applied"
    );
    await expect(applyOrderState(payload as never, paid)).resolves.toBe(
      "ignored"
    );

    const awards = activities(payload, "eventTicket");
    expect(awards).toHaveLength(1);
    expect(awards[0]).toMatchObject({
      point: 250,
      action: "eventTicket",
      providerRef: "shows:order:ref_1",
      user: "user-1",
      description: "Lagos Live ticket",
      metadata: {
        source: "shows",
        reference: "ref_1",
        orderReference: null,
      },
    });
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      state: "paid",
      orderVersion: "1",
      pointsAwarded: 250,
    });
  });

  it("ignores an older order version", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [order({ state: "paid", orderVersion: "10" })],
      },
    });

    await expect(
      applyOrderState(payload as never, {
        reference: "ref_1",
        state: "cancelled",
        orderVersion: "9",
      })
    ).resolves.toBe("ignored");
    expect(payload.docs("ticket-orders")[0]?.state).toBe("paid");
  });

  it("compares versions numerically, not as strings", async () => {
    const payload = createFakePayload({
      collections: { "ticket-orders": [order()] },
    });

    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "expired",
      orderVersion: "9",
    });
    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "paid",
      orderVersion: "10",
    });

    // A string compare would put "9" after "10" and leave the row expired.
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      state: "paid",
      orderVersion: "10",
    });
  });

  it("reverses proportionally on two partial refunds without exceeding the award", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [order({ state: "paid", pointsAwarded: 250 })],
      },
    });

    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "refunded",
      refundId: "refund-1",
      refundedMinor: 425_000,
      orderVersion: "1",
    });
    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "refunded",
      refundId: "refund-2",
      refundedMinor: 850_000,
      orderVersion: "2",
    });
    // A later, larger-looking refund cannot reverse more than the award.
    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "refunded",
      refundId: "refund-3",
      refundedMinor: 1_700_000,
      orderVersion: "3",
    });

    const reversals = activities(payload, "pointReversal");
    expect(reversals.map((row) => row.point)).toEqual([-125, -125]);
    expect(reversals[0]?.providerRef).toBe("shows:refund:ref_1:refund-1");
    expect(reversals[1]?.providerRef).toBe("shows:refund:ref_1:refund-2");
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      pointsReversed: 250,
    });
  });

  it("does not award when a refund arrived before paid", async () => {
    const payload = createFakePayload({
      collections: { "ticket-orders": [order()] },
    });

    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "refunded",
      refundId: "refund-1",
      refundedMinor: 850_000,
      orderVersion: "1",
    });
    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "paid",
      orderVersion: "1",
    });

    expect(activities(payload, "eventTicket")).toHaveLength(0);
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      pointsAwarded: 0,
      refundedMinor: 850_000,
    });
  });

  it("reverses a pre-award partial refund once the paid event lands", async () => {
    const payload = createFakePayload({
      collections: { "ticket-orders": [order()] },
    });

    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "refunded",
      refundId: "refund-1",
      refundedMinor: 425_000,
      orderVersion: "1",
    });
    expect(activities(payload, "pointReversal")).toHaveLength(0);

    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "paid",
      orderVersion: "1",
    });

    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      pointsAwarded: 250,
      pointsReversed: 125,
    });
    expect(
      activities(payload, "pointReversal").map((row) => row.point)
    ).toEqual([-125]);
  });

  it("does not double-reverse a duplicate refund event", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [order({ state: "paid", pointsAwarded: 250 })],
      },
    });
    const refund = {
      reference: "ref_1",
      state: "refunded" as const,
      refundId: "refund-1",
      refundedMinor: 425_000,
      orderVersion: "1",
    };

    await applyOrderState(payload as never, refund);
    await applyOrderState(payload as never, refund);

    expect(activities(payload, "pointReversal")).toHaveLength(1);
    expect(payload.docs("ticket-orders")[0]?.pointsReversed).toBe(125);
  });

  it("stops awarding after two paid orders for the same event", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          order({ id: "order-a", reference: "ref_a", state: "paid" }),
          order({ id: "order-b", reference: "ref_b", state: "paid" }),
          order({ id: "order-c", reference: "ref_c" }),
        ],
      },
    });

    await applyOrderState(payload as never, {
      reference: "ref_c",
      state: "paid",
      orderVersion: "1",
    });

    expect(activities(payload, "eventTicket")).toHaveLength(0);
    expect(payload.docs("ticket-orders")[2]?.pointsAwarded).toBe(0);
  });

  it("applies two refunds that each start at version 1", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [order({ state: "paid", pointsAwarded: 250 })],
      },
    });

    await expect(
      applyOrderState(payload as never, {
        reference: "ref_1",
        state: "refunded",
        refundId: "refund-1",
        refundedMinor: 425_000,
        orderVersion: "1",
      })
    ).resolves.toBe("applied");
    await expect(
      applyOrderState(payload as never, {
        reference: "ref_1",
        state: "refunded",
        refundId: "refund-2",
        refundedMinor: 850_000,
        // Every refund aggregate has its own version 1; it must not gate.
        orderVersion: "1",
      })
    ).resolves.toBe("applied");

    const reversals = activities(payload, "pointReversal");
    expect(reversals.map((row) => row.point)).toEqual([-125, -125]);
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      refundedMinor: 850_000,
      pointsReversed: 250,
    });
  });

  it("does not regress a late older refund or reverse twice", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          order({
            state: "refunded",
            pointsAwarded: 250,
            pointsReversed: 250,
            refundedMinor: 850_000,
            refundVersion: "2",
          }),
        ],
        activities: [
          {
            id: "activity-1",
            user: "user-1",
            action: "eventTicket",
            point: 250,
            providerRef: "shows:order:ref_1",
          },
          {
            id: "activity-2",
            user: "user-1",
            action: "pointReversal",
            point: -125,
            providerRef: "shows:refund:ref_1:refund-1",
          },
          {
            id: "activity-3",
            user: "user-1",
            action: "pointReversal",
            point: -125,
            providerRef: "shows:refund:ref_1:refund-2",
          },
        ],
      },
    });

    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "refunded",
      refundId: "refund-old",
      refundedMinor: 425_000,
      orderVersion: "1",
    });

    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      refundedMinor: 850_000,
      pointsReversed: 250,
    });
    expect(activities(payload, "pointReversal")).toHaveLength(2);
  });

  it("prices the award from the signed amount, not the shelf price", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [order({ amountMinor: 100_000 })],
      },
    });

    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "paid",
      amountMinor: 850_000,
      orderVersion: "1",
    });

    expect(activities(payload, "eventTicket")[0]?.point).toBe(250);
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      amountMinor: 850_000,
      pointsAwarded: 250,
    });
  });

  it("reconciles a crash after the award activity was created", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [order()],
        activities: [
          {
            id: "activity-1",
            user: "user-1",
            action: "eventTicket",
            point: 250,
            providerRef: "shows:order:ref_1",
          },
        ],
      },
    });

    await applyOrderState(payload as never, {
      reference: "ref_1",
      state: "paid",
      orderVersion: "1",
    });

    expect(activities(payload, "eventTicket")).toHaveLength(1);
    expect(payload.docs("ticket-orders")[0]?.pointsAwarded).toBe(250);
  });

  it("fails for a reference it cannot resolve", async () => {
    const payload = createFakePayload();

    await expect(
      applyOrderState(payload as never, {
        reference: "ref_unknown",
        state: "paid",
      })
    ).resolves.toBe("failed");
  });
});
