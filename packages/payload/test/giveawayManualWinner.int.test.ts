import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { BasePayload } from "payload";

import type { GiveawayStatus } from "../src/collections/giveaway/constants";
import { GiveawayEngine } from "../src/lib/giveaway/GiveawayEngine";
import { getTestPayload, resetGiveawayTables } from "./helpers/testPayload";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let payload: BasePayload;

/** Same stubbed Winner Report sender as giveawayDraw.int.test.ts. */
const sentReports: { subject: string }[] = [];
const engine = () =>
  new GiveawayEngine(payload, {
    reportSender: async (message) => {
      sentReports.push({ subject: message.subject });
      return { id: null };
    },
  });

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
 * The draw harness's setup, plus status/endDate overrides and the catalogue
 * prize id, for manual-winner tests that seat before or after the draw.
 */
async function createDrawableGiveaway({
  participants = 1,
  maxUnits = 1,
  status = "active",
  endDate = new Date(Date.now() - HOUR).toISOString(),
}: {
  participants?: number;
  maxUnits?: number;
  status?: GiveawayStatus;
  endDate?: string;
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
      name: `Manual winner ${Date.now()}`,
      status,
      startDate: new Date(Date.now() - 8 * DAY).toISOString(),
      // Set up while the countdown still runs: the pool hook refuses new
      // prize rows once the end date has passed. The requested endDate is
      // applied after setup, below.
      endDate: new Date(Date.now() + DAY).toISOString(),
      ticketPrice: 50,
      minTicketsRequired: 1,
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

  await payload.update({
    collection: "giveaways",
    id: giveaway.id,
    data: { endDate },
  });

  return {
    giveawayId: String(giveaway.id),
    prizeRowId: String(prizeRow.id),
    prizeId: String(prize.id),
    userIds,
  };
}

/** Seat a winner the way the engine would, without the engine method. */
async function seatWinner({
  giveawayId,
  prizeRowId,
  prizeId,
  userId,
  claimStatus = "unclaimed",
}: {
  giveawayId: string;
  prizeRowId: string;
  prizeId: string;
  userId: string;
  claimStatus?: "unclaimed" | "disqualified";
}) {
  const tickets = await payload.find({
    collection: "giveaway-tickets",
    where: {
      and: [{ giveaway: { equals: giveawayId } }, { user: { equals: userId } }],
    },
    limit: 1,
    depth: 0,
  });
  const ticket = tickets.docs[0];
  if (!ticket) {
    throw new Error(`No ticket for ${userId}`);
  }

  await payload.create({
    collection: "giveaway-winners",
    data: {
      giveaway: giveawayId,
      user: userId,
      tier: "tier3",
      prize: prizeId,
      prizeName: "500 Dream Points",
      winningTicket: String(ticket.id),
      validTicketCount: 1,
      boostCount: 0,
      featuredOfferCount: 0,
      selectedAt: new Date().toISOString(),
      claimStatus,
      fulfilmentStatus: "pending",
    },
  });

  await payload.update({
    collection: "giveaway-prizes",
    id: prizeRowId,
    data: { unitsAwarded: 1 },
    context: { giveawayEngine: true },
  });
}

async function winnerRows(giveawayId: string) {
  const winners = await payload.find({
    collection: "giveaway-winners",
    where: { giveaway: { equals: giveawayId } },
    pagination: false,
    depth: 0,
  });
  return winners.docs;
}

describe("draw with a pre-seated winner", () => {
  test("a seated winner is not drawn again", async () => {
    const setup = await createDrawableGiveaway({
      participants: 3,
      maxUnits: 3,
    });
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }
    await seatWinner({ ...setup, userId: seated });

    await engine().runDraw(setup.giveawayId);

    const rows = await winnerRows(setup.giveawayId);
    expect(rows.filter((row) => String(row.user) === seated)).toHaveLength(1);
    expect(rows).toHaveLength(3);

    const prizeRow = await payload.findByID({
      collection: "giveaway-prizes",
      id: setup.prizeRowId,
      depth: 0,
    });
    expect(prizeRow.unitsAwarded).toBe(3);
  }, 120_000);

  test("a disqualified seated winner is not drawn again", async () => {
    const setup = await createDrawableGiveaway({
      participants: 3,
      maxUnits: 3,
    });
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }
    await seatWinner({ ...setup, userId: seated, claimStatus: "disqualified" });

    await engine().runDraw(setup.giveawayId);

    const rows = await winnerRows(setup.giveawayId);
    expect(rows.filter((row) => String(row.user) === seated)).toHaveLength(1);
  }, 120_000);

  test("a dry run does not pick a seated winner", async () => {
    const setup = await createDrawableGiveaway({
      participants: 3,
      maxUnits: 3,
    });
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }
    await seatWinner({ ...setup, userId: seated });

    const result = await engine().runDraw(setup.giveawayId, { dryRun: true });

    for (const tier of result.tiers) {
      for (const winner of tier.winners) {
        expect(winner.userKey).not.toBe(seated);
      }
    }
  }, 120_000);
});
