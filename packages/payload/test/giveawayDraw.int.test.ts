import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { BasePayload } from "payload";

import { GiveawayEngine } from "../src/lib/giveaway/GiveawayEngine";
import { getTestPayload, resetGiveawayTables } from "./helpers/testPayload";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let payload: BasePayload;

/**
 * The §21 Winner Report goes to a real inbox on a completed draw. The engine
 * takes an injectable sender for exactly this reason, so every draw here uses
 * one that goes nowhere. The stubbed Resend key in the test helper is the outer
 * guard; this is the one that expresses the intent.
 */
const sentReports: { subject: string }[] = [];
const engine = () =>
  new GiveawayEngine(payload, {
    reportSender: async (message) => {
      sentReports.push({ subject: message.subject });
      return { id: null };
    },
  });

// The first boot pushes the whole schema, which takes far longer than the
// default hook timeout allows.
beforeAll(async () => {
  payload = await getTestPayload();
}, 180_000);

beforeEach(async () => {
  await resetGiveawayTables(payload);
  sentReports.length = 0;
});

let userCount = 0;

async function createUser(): Promise<string> {
  userCount += 1;
  const doc = await payload.create({
    collection: "users",
    data: {
      name: `Test Participant ${userCount}`,
      username: `tester_${Date.now()}_${userCount}`,
      email: `tester_${Date.now()}_${userCount}@example.invalid`,
      wish: "A working draw",
      phone: `080000000${userCount.toString().padStart(2, "0")}`,
    },
  });

  return String(doc.id);
}

/**
 * The setup an administrator performs in the CMS, in the order they must do it:
 * a prize in the catalogue, a giveaway, that prize selected for the giveaway,
 * and a ticket bought against it.
 */
async function createDrawableGiveaway({
  participants = 1,
  maxUnits = 1,
}: {
  participants?: number;
  maxUnits?: number;
} = {}) {
  const prize = await payload.create({
    collection: "prize-catalogue",
    data: {
      name: `500 Dream Points ${Date.now()}`,
      tier: "tier3",
      fulfilmentType: "points",
      pointsAmount: 500,
      active: true,
    },
  });

  const giveaway = await payload.create({
    collection: "giveaways",
    data: {
      name: `Integration draw ${Date.now()}`,
      status: "active",
      startDate: new Date(Date.now() - 8 * DAY).toISOString(),
      // Already over, so the draw is eligible without special-casing the date.
      endDate: new Date(Date.now() - HOUR).toISOString(),
      ticketPrice: 50,
      minTicketsRequired: 1,
      // Tier 3 only: the catalogue has no tier 1 or tier 2 prize, and a tier
      // enabled without prizes is refused by the engine's own validation.
      tier1WinnerPercentage: 0,
      tier2WinnerPercentage: 0,
      tier3WinnerPercentage: 100,
      budgetUtilizationPct: 100,
    },
  });

  const prizeRow = await payload.create({
    collection: "giveaway-prizes",
    data: {
      giveaway: giveaway.id,
      prize: prize.id,
      tier: "tier3",
      maxUnits,
    },
  });

  const userIds: string[] = [];
  for (let i = 0; i < participants; i += 1) {
    const userId = await createUser();
    userIds.push(userId);

    await payload.create({
      collection: "giveaway-tickets",
      data: {
        giveaway: giveaway.id,
        user: userId,
        quantity: 1,
        unitPrice: 50,
        purchasedAt: new Date(Date.now() - DAY).toISOString(),
        status: "valid",
      },
    });
  }

  return {
    giveawayId: String(giveaway.id),
    prizeRowId: String(prizeRow.id),
    userIds,
  };
}

describe("giveaway draw, against a real database", () => {
  test("runs a draw to completion and records what it awarded", async () => {
    const { giveawayId, prizeRowId, userIds } = await createDrawableGiveaway();

    const result = await engine().runDraw(giveawayId);

    expect(result.totalValidParticipants).toBe(1);
    expect(result.totalWinners).toBe(1);

    const giveaway = await payload.findByID({
      collection: "giveaways",
      id: giveawayId,
      depth: 0,
    });
    expect(giveaway.status).toBe("completed");
    expect(giveaway.drawCompletedAt).toBeTruthy();
    expect(giveaway.drawError).toBeFalsy();

    const winners = await payload.find({
      collection: "giveaway-winners",
      where: { giveaway: { equals: giveawayId } },
      pagination: false,
      depth: 0,
    });
    expect(winners.docs).toHaveLength(1);
    expect(String(winners.docs[0].user)).toBe(userIds[0]);
    expect(winners.docs[0].claimStatus).toBe("unclaimed");

    /**
     * The assertion this whole file exists for.
     *
     * Writing `unitsAwarded` is what the §5 prize-pool lock refused, because
     * a draw is `draw_in_progress` while it allocates and that is a locked
     * status. The engine's own tests could not see it: their fake payload has
     * no collection hooks, so the lock never ran. Here it does.
     */
    const prizeRow = await payload.findByID({
      collection: "giveaway-prizes",
      id: prizeRowId,
      depth: 0,
    });
    expect(prizeRow.unitsAwarded).toBe(1);
  }, 120_000);

  test("still refuses an administrator editing the pool mid-draw", async () => {
    // The engine's exemption from the lock must not have opened it to
    // everyone: a completed giveaway's pool stays closed.
    const { giveawayId, prizeRowId } = await createDrawableGiveaway();
    await engine().runDraw(giveawayId);

    const attempt = payload.update({
      collection: "giveaway-prizes",
      id: prizeRowId,
      data: { maxUnits: 99 },
    });

    await expect(attempt).rejects.toThrow();
  }, 120_000);

  test("awards no more units than the pool holds", async () => {
    // Three participants, one unit. Tier 3 is at 100%, so without the unit
    // cap every one of them would win.
    const { giveawayId, prizeRowId } = await createDrawableGiveaway({
      participants: 3,
      maxUnits: 1,
    });

    const result = await engine().runDraw(giveawayId);

    expect(result.totalValidParticipants).toBe(3);
    expect(result.totalWinners).toBe(1);

    const prizeRow = await payload.findByID({
      collection: "giveaway-prizes",
      id: prizeRowId,
      depth: 0,
    });
    expect(prizeRow.unitsAwarded).toBe(1);
  }, 120_000);

  test("refuses to draw the same giveaway twice", async () => {
    const { giveawayId } = await createDrawableGiveaway();
    const drawEngine = engine();

    await drawEngine.runDraw(giveawayId);

    await expect(drawEngine.runDraw(giveawayId)).rejects.toThrow(
      /already completed/
    );
  }, 120_000);
});
