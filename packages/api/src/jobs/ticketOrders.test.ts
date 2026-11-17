import { describe, expect, it } from "bun:test";

import type { ShowsConfig } from "../lib/shows/config";
import { createFakePayload } from "../test-utils";
import { reconcileTicketOrders } from "./ticketOrders";

/**
 * The reconciliation job is the safety net for a lost webhook, or for a crash
 * between storing `paid` and awarding points. It reads Shows, then hands the
 * report to `applyOrderState` — it never writes the state itself.
 */

const NOW = new Date("2026-11-17T12:00:00.000Z");
const OLD = new Date(NOW.getTime() - 5 * 60_000).toISOString();

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
    createdAt: OLD,
    ...overrides,
  };
}

const PAID_PURCHASE = {
  reference: "ref_1",
  state: "paid",
  amountMinor: 850_000,
  currency: "NGN",
};

/** A Shows config whose fetch answers from `purchases`; no network. */
function shows(purchases: Record<string, unknown>): ShowsConfig {
  return {
    credential: "test-credential",
    fetchImpl: ((input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      const reference = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const purchase = purchases[reference];

      if (purchase instanceof Error) {
        throw purchase;
      }
      if (purchase === undefined) {
        return Promise.resolve(
          Response.json(
            { error: { code: "not_found", message: "missing" } },
            { status: 404 }
          )
        );
      }
      return Promise.resolve(Response.json(purchase));
    }) as typeof fetch,
  };
}

describe("reconcileTicketOrders", () => {
  it("moves a pending order older than 30s to paid", async () => {
    const payload = createFakePayload({
      collections: { "ticket-orders": [order()] },
    });

    const result = await reconcileTicketOrders(payload as never, {
      now: NOW,
      shows: shows({ ref_1: PAID_PURCHASE }),
    });

    expect(result).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      state: "paid",
      pointsAwarded: 250,
    });
  });

  it("checks a pending order whose last sync is old even when it is new", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          order({
            createdAt: new Date(NOW.getTime() - 5000).toISOString(),
            lastSyncedAt: new Date(NOW.getTime() - 60_000).toISOString(),
          }),
        ],
      },
    });

    const result = await reconcileTicketOrders(payload as never, {
      now: NOW,
      shows: shows({ ref_1: PAID_PURCHASE }),
    });

    expect(result).toEqual({ checked: 1, changed: 1, failed: 0 });
  });

  it("skips a fresh pending order", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          order({ createdAt: new Date(NOW.getTime() - 10_000).toISOString() }),
        ],
      },
    });

    const result = await reconcileTicketOrders(payload as never, {
      now: NOW,
      shows: shows({ ref_1: PAID_PURCHASE }),
    });

    expect(result).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(payload.docs("ticket-orders")[0]?.state).toBe("pending");
  });

  it("skips an abandoned checkout with no reference", async () => {
    const payload = createFakePayload({
      collections: { "ticket-orders": [order({ reference: null })] },
    });

    const result = await reconcileTicketOrders(payload as never, {
      now: NOW,
      shows: shows({}),
    });

    expect(result).toEqual({ checked: 0, changed: 0, failed: 0 });
  });

  it("skips an order beyond the 72 hour window", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          order({
            createdAt: new Date(NOW.getTime() - 73 * 3_600_000).toISOString(),
          }),
        ],
      },
    });

    const result = await reconcileTicketOrders(payload as never, {
      now: NOW,
      shows: shows({ ref_1: PAID_PURCHASE }),
    });

    expect(result).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(payload.docs("ticket-orders")[0]?.state).toBe("pending");
  });

  it("awards a paid order that has no points yet", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [order({ state: "paid", pointsAwarded: 0 })],
      },
    });

    const result = await reconcileTicketOrders(payload as never, {
      now: NOW,
      shows: shows({ ref_1: PAID_PURCHASE }),
    });

    expect(result).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(
      payload.docs("activities").filter((row) => row.action === "eventTicket")
    ).toHaveLength(1);
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      state: "paid",
      pointsAwarded: 250,
    });
  });

  it("counts a failed read and keeps going", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          order({
            id: "order-1",
            reference: "ref_1",
            createdAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
          }),
          order({
            id: "order-2",
            reference: "ref_2",
            createdAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
          }),
        ],
      },
    });

    const result = await reconcileTicketOrders(payload as never, {
      now: NOW,
      shows: shows({
        ref_1: new Error("Shows is down"),
        ref_2: { ...PAID_PURCHASE, reference: "ref_2" },
      }),
    });

    expect(result).toEqual({ checked: 2, changed: 1, failed: 1 });
    expect(
      payload.docs("ticket-orders").find((row) => row.reference === "ref_2")
    ).toMatchObject({ state: "paid", pointsAwarded: 250 });
  });

  it("changes nothing on a second run", async () => {
    const payload = createFakePayload({
      collections: { "ticket-orders": [order()] },
    });
    const options = {
      now: NOW,
      shows: shows({ ref_1: PAID_PURCHASE }),
    };

    const first = await reconcileTicketOrders(payload as never, options);
    const second = await reconcileTicketOrders(payload as never, options);

    expect(first).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(second).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(
      payload.docs("activities").filter((row) => row.action === "eventTicket")
    ).toHaveLength(1);
    expect(payload.docs("ticket-orders")[0]?.awardAttemptedAt).toBeTruthy();
  });

  it("does not re-select an award that was capped", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [
          order({ state: "paid", pointsAwarded: 0 }),
          order({
            id: "order-2",
            reference: "ref_2",
            state: "paid",
            pointsAwarded: 100,
            createdAt: new Date(NOW.getTime() - 6 * 60_000).toISOString(),
          }),
          order({
            id: "order-3",
            reference: "ref_3",
            state: "paid",
            pointsAwarded: 100,
            createdAt: new Date(NOW.getTime() - 7 * 60_000).toISOString(),
          }),
        ],
      },
    });
    const options = {
      now: NOW,
      shows: shows({ ref_1: PAID_PURCHASE }),
    };

    const first = await reconcileTicketOrders(payload as never, options);
    const second = await reconcileTicketOrders(payload as never, options);

    expect(first).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(second).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(payload.docs("activities")).toHaveLength(0);
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      pointsAwarded: 0,
    });
  });

  it("re-selects a row whose award attempt threw", async () => {
    const payload = createFakePayload({
      collections: {
        "ticket-orders": [order({ state: "paid", pointsAwarded: 0 })],
      },
    });
    const create = payload.create.bind(payload);
    payload.create = (args) => {
      if (args.collection === "activities") {
        throw new Error("activities write failed");
      }
      return create(args);
    };
    const options = {
      now: NOW,
      shows: shows({ ref_1: PAID_PURCHASE }),
    };

    const first = await reconcileTicketOrders(payload as never, options);
    expect(first).toEqual({ checked: 1, changed: 0, failed: 1 });
    expect(payload.docs("ticket-orders")[0]?.awardAttemptedAt).toBeUndefined();

    const second = await reconcileTicketOrders(payload as never, options);
    expect(second).toEqual({ checked: 1, changed: 0, failed: 1 });
  });
});
