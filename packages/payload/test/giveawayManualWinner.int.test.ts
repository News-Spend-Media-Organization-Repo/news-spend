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

async function auditRows(giveawayId: string, eventType?: string) {
  const rows = await payload.find({
    collection: "giveaway-audit-log",
    where: {
      and: [
        { giveaway: { equals: giveawayId } },
        ...(eventType ? [{ eventType: { equals: eventType } }] : []),
      ],
    },
    pagination: false,
    depth: 0,
  });
  return rows.docs;
}

async function ticketIdFor(giveawayId: string, userId: string) {
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
  return String(ticket.id);
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

describe("addManualWinner", () => {
  const addedBy = "ops@example.invalid";

  test("pre-draw seat", async () => {
    const setup = await createDrawableGiveaway({
      participants: 3,
      maxUnits: 3,
      endDate: new Date(Date.now() + DAY).toISOString(),
    });
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }

    const result = await engine().addManualWinner(setup.giveawayId, {
      userKey: seated,
      prizeRowId: setup.prizeRowId,
      addedBy,
    });

    expect(result.phase).toBe("pre_draw");
    expect(result.unitsRemaining).toBe(2);

    const rows = await winnerRows(setup.giveawayId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.tier).toBe("tier3");
    expect(String(row?.prize)).toBe(setup.prizeId);
    expect(row?.claimStatus).toBe("unclaimed");
    expect(row?.fulfilmentStatus).toBe("pending");
    expect(String(row?.winningTicket)).toBe(
      await ticketIdFor(setup.giveawayId, seated)
    );

    const giveaway = await payload.findByID({
      collection: "giveaways",
      id: setup.giveawayId,
      depth: 0,
    });
    expect(giveaway.status).toBe("active");

    const manual = await auditRows(setup.giveawayId, "manual_winner_added");
    expect(manual).toHaveLength(1);
    expect(manual[0]?.detail).toMatchObject({
      tier: "tier3",
      phase: "pre_draw",
      addedBy,
    });
    const selected = await auditRows(setup.giveawayId, "winner_selected");
    expect(selected.some((entry) => String(entry.user) === seated)).toBe(true);

    // The sweep still draws the giveaway afterwards, and the seat stands.
    await payload.update({
      collection: "giveaways",
      id: setup.giveawayId,
      data: { endDate: new Date(Date.now() - HOUR).toISOString() },
    });
    await engine().runDraw(setup.giveawayId);

    const after = await winnerRows(setup.giveawayId);
    expect(after.filter((r) => String(r.user) === seated)).toHaveLength(1);
    const prizeRow = await payload.findByID({
      collection: "giveaway-prizes",
      id: setup.prizeRowId,
      depth: 0,
    });
    expect(prizeRow.unitsAwarded).toBe(3);
  }, 120_000);

  test("post-draw top-up", async () => {
    const setup = await createDrawableGiveaway({
      participants: 2,
      maxUnits: 2,
    });
    // Half the participants may win, so the draw awards only one of the two.
    await payload.update({
      collection: "giveaways",
      id: setup.giveawayId,
      data: { tier3WinnerPercentage: 50 },
    });
    await engine().runDraw(setup.giveawayId);

    const drawn = await winnerRows(setup.giveawayId);
    expect(drawn).toHaveLength(1);
    const winnerKey = String(drawn[0]?.user);
    const nonWinner = setup.userIds.find((id) => id !== winnerKey);
    if (!nonWinner) {
      throw new Error("no non-winner");
    }

    const result = await engine().addManualWinner(setup.giveawayId, {
      userKey: nonWinner,
      prizeRowId: setup.prizeRowId,
      addedBy,
    });

    expect(result.phase).toBe("post_draw");
    const giveaway = await payload.findByID({
      collection: "giveaways",
      id: setup.giveawayId,
      depth: 0,
    });
    expect(giveaway.status).toBe("completed");

    const prizeRow = await payload.findByID({
      collection: "giveaway-prizes",
      id: setup.prizeRowId,
      depth: 0,
    });
    expect(prizeRow.unitsAwarded).toBe(2);

    expect(await auditRows(setup.giveawayId, "prize_exhausted")).toHaveLength(
      1
    );
    expect(
      await auditRows(setup.giveawayId, "manual_winner_added")
    ).toHaveLength(1);
    const selected = await auditRows(setup.giveawayId, "winner_selected");
    expect(selected.some((entry) => String(entry.user) === nonWinner)).toBe(
      true
    );
    const allocated = await auditRows(setup.giveawayId, "prize_allocated");
    expect(allocated.some((entry) => String(entry.user) === nonWinner)).toBe(
      true
    );
  }, 120_000);

  test("refuses a further seat once the unit cap is hit", async () => {
    const setup = await createDrawableGiveaway({
      participants: 2,
      maxUnits: 1,
    });
    const [first, second] = setup.userIds;
    if (!(first && second)) {
      throw new Error("need two participants");
    }
    await engine().addManualWinner(setup.giveawayId, {
      userKey: first,
      prizeRowId: setup.prizeRowId,
      addedBy,
    });

    await expect(
      engine().addManualWinner(setup.giveawayId, {
        userKey: second,
        prizeRowId: setup.prizeRowId,
        addedBy,
      })
    ).rejects.toMatchObject({ code: "MANUAL_WINNER_PRIZE_EXHAUSTED" });

    const prizeRow = await payload.findByID({
      collection: "giveaway-prizes",
      id: setup.prizeRowId,
      depth: 0,
    });
    expect(prizeRow.unitsAwarded).toBe(1);
  }, 120_000);

  test("refuses someone with no valid ticket", async () => {
    const setup = await createDrawableGiveaway();
    const outsider = await createUser();

    await expect(
      engine().addManualWinner(setup.giveawayId, {
        userKey: outsider,
        prizeRowId: setup.prizeRowId,
        addedBy,
      })
    ).rejects.toMatchObject({ code: "MANUAL_WINNER_NO_TICKET" });
  }, 120_000);

  test("refuses someone whose only ticket was refunded", async () => {
    const setup = await createDrawableGiveaway();
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }
    const ticketId = await ticketIdFor(setup.giveawayId, seated);
    await payload.update({
      collection: "giveaway-tickets",
      id: ticketId,
      data: { status: "refunded" },
    });

    await expect(
      engine().addManualWinner(setup.giveawayId, {
        userKey: seated,
        prizeRowId: setup.prizeRowId,
        addedBy,
      })
    ).rejects.toMatchObject({ code: "MANUAL_WINNER_NO_TICKET" });
  }, 120_000);

  test("refuses a second seat for the same person", async () => {
    const setup = await createDrawableGiveaway({ maxUnits: 2 });
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }
    const input = {
      userKey: seated,
      prizeRowId: setup.prizeRowId,
      addedBy,
    };
    await engine().addManualWinner(setup.giveawayId, input);

    await expect(
      engine().addManualWinner(setup.giveawayId, input)
    ).rejects.toMatchObject({ code: "MANUAL_WINNER_ALREADY_WINNER" });

    const prizeRow = await payload.findByID({
      collection: "giveaway-prizes",
      id: setup.prizeRowId,
      depth: 0,
    });
    expect(prizeRow.unitsAwarded).toBe(1);
  }, 120_000);

  test("refuses a disqualified winner", async () => {
    const setup = await createDrawableGiveaway({ maxUnits: 2 });
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }
    const { winnerId } = await engine().addManualWinner(setup.giveawayId, {
      userKey: seated,
      prizeRowId: setup.prizeRowId,
      addedBy,
    });
    await payload.update({
      collection: "giveaway-winners",
      id: winnerId,
      data: { claimStatus: "disqualified" },
    });

    await expect(
      engine().addManualWinner(setup.giveawayId, {
        userKey: seated,
        prizeRowId: setup.prizeRowId,
        addedBy,
      })
    ).rejects.toMatchObject({ code: "MANUAL_WINNER_ALREADY_WINNER" });
  }, 120_000);

  test("refuses a prize row from another giveaway", async () => {
    const other = await createDrawableGiveaway({ status: "draft" });
    const setup = await createDrawableGiveaway();
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }

    await expect(
      engine().addManualWinner(setup.giveawayId, {
        userKey: seated,
        prizeRowId: other.prizeRowId,
        addedBy,
      })
    ).rejects.toMatchObject({ code: "MANUAL_WINNER_PRIZE_NOT_IN_POOL" });
  }, 120_000);

  test("refuses cancelled, interrupted and draw_in_progress giveaways", async () => {
    for (const status of [
      "cancelled",
      "interrupted",
      "draw_in_progress",
    ] as const) {
      const setup = await createDrawableGiveaway();
      const seated = setup.userIds[0];
      if (!seated) {
        throw new Error("no participant");
      }
      await payload.update({
        collection: "giveaways",
        id: setup.giveawayId,
        data: { status },
      });

      await expect(
        engine().addManualWinner(setup.giveawayId, {
          userKey: seated,
          prizeRowId: setup.prizeRowId,
          addedBy,
        })
      ).rejects.toMatchObject({
        code: "MANUAL_WINNER_BAD_STATUS",
        message: expect.stringContaining(status),
      });
      expect(await winnerRows(setup.giveawayId)).toHaveLength(0);
    }
  }, 120_000);

  test("refuses an excluded account", async () => {
    const setup = await createDrawableGiveaway();
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }
    await payload.create({
      collection: "giveaway-account-flags",
      data: { user: seated, duplicateAccountGroup: "g1" },
    });

    await expect(
      engine().addManualWinner(setup.giveawayId, {
        userKey: seated,
        prizeRowId: setup.prizeRowId,
        addedBy,
      })
    ).rejects.toMatchObject({ code: "MANUAL_WINNER_ACCOUNT_EXCLUDED" });
  }, 120_000);

  test("holds a flagged account for review", async () => {
    const setup = await createDrawableGiveaway();
    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }
    await payload.create({
      collection: "giveaway-account-flags",
      data: { user: seated, trustStatus: "suspicious" },
    });

    const { winnerId } = await engine().addManualWinner(setup.giveawayId, {
      userKey: seated,
      prizeRowId: setup.prizeRowId,
      addedBy,
      reason: "Goodwill award",
    });

    const row = await payload.findByID({
      collection: "giveaway-winners",
      id: winnerId,
      depth: 0,
    });
    expect(row.fulfilmentStatus).toBe("on_hold");
    expect(row.reviewNote).toBeTruthy();
  }, 120_000);

  test("refuses a post-draw seat once a later giveaway has started", async () => {
    const setup = await createDrawableGiveaway({ maxUnits: 2 });
    await engine().runDraw(setup.giveawayId);

    const successor = await createDrawableGiveaway();
    await payload.update({
      collection: "giveaways",
      id: successor.giveawayId,
      data: {
        startDate: new Date(Date.now() - HOUR).toISOString(),
        endDate: new Date(Date.now() + DAY).toISOString(),
      },
    });

    const seated = setup.userIds[0];
    if (!seated) {
      throw new Error("no participant");
    }
    await expect(
      engine().addManualWinner(setup.giveawayId, {
        userKey: seated,
        prizeRowId: setup.prizeRowId,
        addedBy,
      })
    ).rejects.toMatchObject({ code: "MANUAL_WINNER_SUPERSEDED" });
    expect(await winnerRows(setup.giveawayId)).toHaveLength(1);
  }, 120_000);
});

describe("listParticipants", () => {
  const addedBy = "ops@example.invalid";

  test("lists ticket holders, not winners or excluded accounts", async () => {
    const setup = await createDrawableGiveaway({
      participants: 4,
      maxUnits: 3,
    });
    const [seated, excluded, third, fourth] = setup.userIds;
    if (!(seated && excluded && third && fourth)) {
      throw new Error("need four participants");
    }
    await engine().addManualWinner(setup.giveawayId, {
      userKey: seated,
      prizeRowId: setup.prizeRowId,
      addedBy,
    });
    await payload.create({
      collection: "giveaway-account-flags",
      data: { user: excluded, duplicateAccountGroup: "g1" },
    });

    const result = await engine().listParticipants(setup.giveawayId);

    expect(result.total).toBe(2);
    expect(result.participants.map((p) => p.userKey).sort()).toEqual(
      [third, fourth].sort()
    );
    for (const row of result.participants) {
      expect(row.validTickets).toBe(1);
      expect(row.qualifiesFor).toEqual(["tier3"]);
      const user = await payload.findByID({
        collection: "users",
        id: row.userKey,
        depth: 0,
      });
      expect(row.name).toBe(user.name);
    }
    expect(result.prizes[0]?.unitsRemaining).toBe(2);
    expect(result.prizes[0]?.id).toBe(setup.prizeRowId);
  }, 120_000);

  test("searches by name or email, case-insensitively", async () => {
    const setup = await createDrawableGiveaway({ participants: 2 });
    const [first, second] = setup.userIds;
    if (!(first && second)) {
      throw new Error("need two participants");
    }
    // One distinctive name, so a search can match exactly one person.
    await payload.update({
      collection: "users",
      id: second,
      data: { name: "Zephyr Quill" },
    });

    const byName = await engine().listParticipants(setup.giveawayId, {
      search: "PARTICIPANT",
    });
    expect(byName.total).toBe(1);
    expect(byName.participants[0]?.userKey).toBe(first);

    const byLowerName = await engine().listParticipants(setup.giveawayId, {
      search: "zephyr",
    });
    expect(byLowerName.total).toBe(1);
    expect(byLowerName.participants[0]?.userKey).toBe(second);

    const secondUser = await payload.findByID({
      collection: "users",
      id: second,
      depth: 0,
    });
    const byEmail = await engine().listParticipants(setup.giveawayId, {
      search: String(secondUser.email),
    });
    expect(byEmail.total).toBe(1);
    expect(byEmail.participants[0]?.userKey).toBe(second);
  }, 120_000);

  test("returns an empty page rather than failing", async () => {
    const setup = await createDrawableGiveaway({ participants: 2 });

    const noMatch = await engine().listParticipants(setup.giveawayId, {
      search: "nobody-matches-this",
    });
    expect(noMatch.participants).toEqual([]);
    expect(noMatch.total).toBe(0);

    const pastEnd = await engine().listParticipants(setup.giveawayId, {
      page: 99,
    });
    expect(pastEnd.participants).toEqual([]);
    expect(pastEnd.total).toBe(2);

    const clamped = await engine().listParticipants(setup.giveawayId, {
      limit: 1000,
    });
    expect(clamped.limit).toBe(100);
  }, 120_000);
});
