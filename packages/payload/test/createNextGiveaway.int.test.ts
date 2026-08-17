import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { BasePayload } from "payload";

import { createNextGiveaway } from "../src/lib/giveaway/createNextGiveaway";
import { GiveawayEngine } from "../src/lib/giveaway/GiveawayEngine";
import { getTestPayload, resetGiveawayTables } from "./helpers/testPayload";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let payload: BasePayload;

beforeAll(async () => {
  payload = await getTestPayload();
}, 180_000);

beforeEach(async () => {
  await resetGiveawayTables(payload);
});

let seq = 0;

/** A giveaway that has been drawn, with a prize pool behind it. */
async function drawnGiveaway({ withPrizes = true } = {}): Promise<string> {
  seq += 1;

  const giveaway = await payload.create({
    collection: "giveaways",
    data: {
      name: `Previous ${Date.now()}_${seq}`,
      status: "active",
      startDate: new Date(Date.now() - 7 * DAY).toISOString(),
      endDate: new Date(Date.now() - HOUR).toISOString(),
      ticketPrice: 75,
      minTicketsRequired: 2,
      tier1WinnerPercentage: 0,
      tier2WinnerPercentage: 0,
      tier3WinnerPercentage: 100,
      budgetUtilizationPct: 90,
    },
  });

  if (withPrizes) {
    const prize = await payload.create({
      collection: "prize-catalogue",
      data: {
        name: `Carried prize ${Date.now()}_${seq}`,
        tier: "tier3",
        fulfilmentType: "points",
        pointsAmount: 500,
        active: true,
      },
    });

    await payload.create({
      collection: "giveaway-prizes",
      data: {
        giveaway: giveaway.id,
        prize: prize.id,
        tier: "tier3",
        maxUnits: 4,
      },
    });

    const user = await payload.create({
      collection: "users",
      data: {
        name: `Next Participant ${seq}`,
        username: `next_${Date.now()}_${seq}`,
        email: `next_${Date.now()}_${seq}@example.invalid`,
        wish: "Another giveaway",
        phone: `083000000${seq.toString().padStart(2, "0")}`,
      },
    });

    await payload.create({
      collection: "giveaway-tickets",
      data: {
        giveaway: giveaway.id,
        user: user.id,
        quantity: 1,
        unitPrice: 75,
        purchasedAt: new Date(Date.now() - DAY).toISOString(),
        status: "valid",
      },
    });

    await new GiveawayEngine(payload, {
      reportSender: async () => ({ id: null }),
    }).runDraw(String(giveaway.id));
  } else {
    await payload.update({
      collection: "giveaways",
      id: giveaway.id,
      data: {
        status: "completed",
        drawCompletedAt: new Date().toISOString(),
      },
    });
  }

  return String(giveaway.id);
}

describe("opening the next giveaway", () => {
  test("carries the settings and the prize pool forward", async () => {
    const previousId = await drawnGiveaway();

    const result = await createNextGiveaway(payload);
    expect(result.created).toBe(true);

    const active = await payload.find({
      collection: "giveaways",
      where: { status: { equals: "active" } },
      pagination: false,
      depth: 0,
    });
    expect(active.docs).toHaveLength(1);

    const next = active.docs[0];
    expect(next.ticketPrice).toBe(75);
    expect(next.minTicketsRequired).toBe(2);
    expect(next.tier3WinnerPercentage).toBe(100);
    expect(next.budgetUtilizationPct).toBe(90);

    // The same length of window, so the administrator's cadence carries over.
    const span =
      new Date(next.endDate as string).getTime() -
      new Date(next.startDate as string).getTime();
    expect(Math.round(span / DAY)).toBe(7);

    /**
     * The pool is what makes this safe to automate at all: without it the
     * new giveaway would hold the single active slot and sell tickets for
     * prizes nobody had chosen.
     */
    const pool = await payload.find({
      collection: "giveaway-prizes",
      where: { giveaway: { equals: next.id } },
      pagination: false,
      depth: 0,
    });
    expect(pool.docs).toHaveLength(1);
    expect(pool.docs[0].maxUnits).toBe(4);
    // Stock is per giveaway — the new one starts on its own full allowance.
    expect(pool.docs[0].unitsAwarded).toBe(0);

    expect(String(next.id)).not.toBe(previousId);
  }, 120_000);

  test("does nothing while a giveaway is still running", async () => {
    await drawnGiveaway();
    await createNextGiveaway(payload);

    // A second sweep an hour later must not open a third.
    const again = await createNextGiveaway(payload);
    expect(again.created).toBe(false);

    const all = await payload.find({
      collection: "giveaways",
      pagination: false,
      depth: 0,
    });
    expect(all.docs).toHaveLength(2);
  }, 120_000);

  test("does not re-open one an administrator cancelled", async () => {
    await drawnGiveaway();

    const opened = await createNextGiveaway(payload);
    expect(opened.created).toBe(true);

    // Cancelling is a decision to stop. Re-opening on the next sweep would
    // override it every hour.
    await payload.update({
      collection: "giveaways",
      id: (opened as { id: string }).id,
      data: { status: "cancelled" },
    });

    const again = await createNextGiveaway(payload);
    expect(again.created).toBe(false);

    const all = await payload.find({
      collection: "giveaways",
      pagination: false,
      depth: 0,
    });
    expect(all.docs).toHaveLength(2);
  }, 120_000);

  test("refuses to open one with no prizes to award", async () => {
    await drawnGiveaway({ withPrizes: false });

    const result = await createNextGiveaway(payload);

    expect(result.created).toBe(false);
    const active = await payload.find({
      collection: "giveaways",
      where: { status: { equals: "active" } },
      pagination: false,
      depth: 0,
    });
    expect(active.docs).toHaveLength(0);
  }, 120_000);

  test("does nothing before anything has been drawn", async () => {
    const result = await createNextGiveaway(payload);
    expect(result.created).toBe(false);
  }, 120_000);
});
