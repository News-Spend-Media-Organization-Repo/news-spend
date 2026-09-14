import { describe, expect, it } from "bun:test";
import type { SsvCallback } from "@news-spend-media/payload/lib/giveaway/admobSsv";
import { recordGoogleBoost } from "@news-spend-media/payload/lib/giveaway/googleBoost";
import type { BasePayload } from "payload";

type Row = Record<string, any>;

const HOUR = 60 * 60 * 1000;

/**
 * A Google Boost is written by a callback rather than by the app, so none of
 * the router's own guards stand in front of it. Everything that decides
 * whether a verified impression is worth a Boost lives in `recordGoogleBoost`,
 * and these tests are the only place it is exercised.
 */

type FakeData = {
  giveaway?: Row | null;
  tickets?: Row[];
  engagements?: Row[];
  /** Make the insert fail the way a unique index does. */
  createThrows?: Error;
};

function createFakePayload(data: FakeData = {}) {
  const created: Row[] = [];

  const engagements = data.engagements ?? [];
  const tickets = data.tickets ?? [];

  const payload = {
    find: async ({ collection, where }: Row) => {
      if (collection === "giveaways") {
        return { docs: data.giveaway ? [data.giveaway] : [] };
      }

      if (collection === "giveaway-engagements") {
        const wanted = where?.verificationId?.equals;
        return {
          docs: engagements.filter((row) => row.verificationId === wanted),
        };
      }

      if (collection === "giveaway-tickets") {
        return { docs: tickets.filter((row) => row.status === "valid") };
      }

      return { docs: [] };
    },

    count: async ({ collection }: Row) => {
      if (collection !== "giveaway-engagements") {
        return { totalDocs: 0 };
      }
      return {
        totalDocs: engagements.filter(
          (row) =>
            row.type === "boost" &&
            row.source === "google" &&
            row.completionStatus === "completed"
        ).length,
      };
    },

    create: async ({ data: row }: Row) => {
      if (data.createThrows) {
        throw data.createThrows;
      }
      const doc = { id: `engagement-${created.length + 1}`, ...row };
      created.push(doc);
      return doc;
    },
  } as unknown as BasePayload;

  return { payload, created };
}

function openGiveaway(): Row {
  const now = Date.now();
  return {
    id: "giveaway-1",
    status: "active",
    startDate: new Date(now - HOUR).toISOString(),
    endDate: new Date(now + HOUR).toISOString(),
  };
}

function callback(overrides: Partial<SsvCallback> = {}): SsvCallback {
  return {
    transactionId: "txn-1",
    userId: "user-1",
    customData: JSON.stringify({ purpose: "boost" }),
    adUnit: "1234567890",
    rewardItem: "boost",
    rewardAmount: "1",
    timestamp: Date.now(),
    ...overrides,
  };
}

const validTicket = { id: "ticket-1", status: "valid", quantity: 1 };

describe("recordGoogleBoost", () => {
  it("records a Boost for a ticket holder in an open giveaway", async () => {
    const { payload, created } = createFakePayload({
      giveaway: openGiveaway(),
      tickets: [validTicket],
    });

    const outcome = await recordGoogleBoost(payload, callback());

    expect(outcome.status).toBe("recorded");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      type: "boost",
      source: "google",
      content: null,
      verificationId: "txn-1",
      completionStatus: "completed",
    });
  });

  it("ignores a rewarded ad watched somewhere that was not the Boost surface", async () => {
    // Without this, every rewarded impression in the app would mint a Boost.
    const { payload, created } = createFakePayload({
      giveaway: openGiveaway(),
      tickets: [validTicket],
    });

    const outcome = await recordGoogleBoost(
      payload,
      callback({ customData: null })
    );

    expect(outcome).toEqual({ status: "ignored", reason: "not_a_boost" });
    expect(created).toHaveLength(0);
  });

  it("ignores a callback replayed after its Boost was already recorded", async () => {
    const { payload, created } = createFakePayload({
      giveaway: openGiveaway(),
      tickets: [validTicket],
      engagements: [
        {
          id: "existing",
          type: "boost",
          source: "google",
          completionStatus: "completed",
          verificationId: "txn-1",
        },
      ],
    });

    const outcome = await recordGoogleBoost(payload, callback());

    expect(outcome).toEqual({ status: "ignored", reason: "already_recorded" });
    expect(created).toHaveLength(0);
  });

  it("treats the unique index rejecting a concurrent duplicate as already recorded", async () => {
    // Two copies of one callback arriving together both pass the read; the
    // loser must not ask Google to send a reward that has been honoured.
    const { payload } = createFakePayload({
      giveaway: openGiveaway(),
      tickets: [validTicket],
      createThrows: new Error(
        'duplicate key value violates unique constraint "giveaway_engagements_verification_id_idx"'
      ),
    });

    const outcome = await recordGoogleBoost(payload, callback());

    expect(outcome).toEqual({ status: "ignored", reason: "already_recorded" });
  });

  it("refuses a Boost to someone holding no valid ticket", async () => {
    const { payload, created } = createFakePayload({
      giveaway: openGiveaway(),
      tickets: [{ id: "ticket-1", status: "refunded", quantity: 1 }],
    });

    const outcome = await recordGoogleBoost(payload, callback());

    expect(outcome).toEqual({ status: "ignored", reason: "no_valid_ticket" });
    expect(created).toHaveLength(0);
  });

  it("stops at the per-giveaway cap on Google Boosts", async () => {
    const earned = Array.from({ length: 3 }, (_, index) => ({
      id: `earned-${index}`,
      type: "boost",
      source: "google",
      completionStatus: "completed",
      verificationId: `old-${index}`,
    }));

    const { payload, created } = createFakePayload({
      giveaway: openGiveaway(),
      tickets: [validTicket],
      engagements: earned,
    });

    const outcome = await recordGoogleBoost(payload, callback());

    expect(outcome).toEqual({
      status: "ignored",
      reason: "google_boost_cap_reached",
    });
    expect(created).toHaveLength(0);
  });

  it("refuses a Boost verified after the giveaway closed", async () => {
    const now = Date.now();
    const { payload, created } = createFakePayload({
      giveaway: {
        id: "giveaway-1",
        status: "active",
        startDate: new Date(now - 2 * HOUR).toISOString(),
        endDate: new Date(now - HOUR).toISOString(),
      },
      tickets: [validTicket],
    });

    const outcome = await recordGoogleBoost(payload, callback());

    expect(outcome).toEqual({ status: "ignored", reason: "giveaway_not_open" });
    expect(created).toHaveLength(0);
  });

  it("ignores a callback arriving when no giveaway is switched on", async () => {
    const { payload } = createFakePayload({ giveaway: null });

    const outcome = await recordGoogleBoost(payload, callback());

    expect(outcome).toEqual({
      status: "ignored",
      reason: "no_active_giveaway",
    });
  });

  it("asks for a retry when the write fails for a reason that is not a duplicate", async () => {
    const { payload } = createFakePayload({
      giveaway: openGiveaway(),
      tickets: [validTicket],
      createThrows: new Error("connection terminated unexpectedly"),
    });

    const outcome = await recordGoogleBoost(payload, callback());

    expect(outcome.status).toBe("error");
  });
});
