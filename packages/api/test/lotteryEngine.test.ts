import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LotteryEngine } from "../src/lib/lottery/LotteryEngine";

function createFakePayload(participants: any[] = []) {
  const payload: any = {};

  // findByID used to fetch lottery document
  payload.findByID = vi.fn(async ({ collection, id }: any) => {
    if (collection === "lottery") {
      return {
        id,
        isActive: true,
        processing: false,
        // set an endDate in the past/future depending on test needs
        endDate: new Date(Date.now() - 1000 * 60).toISOString(),
      };
    }
    return null;
  });

  // update used for lock acquisition (where) and id-based updates
  payload.update = vi.fn(async (args: any) => {
    // Lock acquisition (where-based update) should return a non-empty result
    if (args?.where) {
      return {
        totalDocs: 1,
        docs: [{ id: args.where?.and?.[0]?.id ?? "lock" }],
      };
    }

    // id-based update (marking lottery inactive etc.)
    if (args?.id) {
      return { id: args.id, ...args.data };
    }

    return { totalDocs: 0 };
  });

  // find used for fetching lottery-tickets and other collections
  payload.find = vi.fn(async ({ collection }: any) => {
    if (collection === "lottery-tickets") {
      return { docs: participants, totalDocs: participants.length };
    }
    // default empty result
    return { docs: [], totalDocs: 0 };
  });

  // create should not be called in dryRun tests; when called, just record
  payload.create = vi.fn(async (args: any) => {
    // Simulate created doc
    return { id: crypto.randomUUID(), ...args.data };
  });

  // Minimal DB transaction stubs (not used for dryRun tests but present)
  payload.db = {
    beginTransaction: vi.fn(async () => 1),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
  };

  return payload;
}

describe("LotteryEngine (unit)", () => {
  let originalRandomBytes: typeof crypto.randomBytes | undefined;

  beforeEach(() => {
    // preserve original
    originalRandomBytes = crypto.randomBytes;
  });

  afterEach(() => {
    // restore crypto.randomBytes if mocked
    if (originalRandomBytes) {
      // @ts-expect-error
      crypto.randomBytes = originalRandomBytes;
    }
    vi.restoreAllMocks();
  });

  it("dryRun should not persist winner rows (payload.create not called)", async () => {
    const participants = [
      { id: "t1", user: "user1", count: 3, boostLuck: 0 },
      { id: "t2", user: "user2", count: 1, boostLuck: 1 },
    ];
    const payload = createFakePayload(participants);
    const engine = new LotteryEngine(payload);

    // stub randomBytes to deterministic buffer
    vi.spyOn(crypto, "randomBytes").mockReturnValue(
      Buffer.from("deadbeefcafebabe1234567890abcdef", "hex")
    );

    const result = await engine.runLottery("lottery-1", {
      numWinners: 2,
      uniqueWinners: true,
      dryRun: true,
    });

    // Expect no creations persisted
    expect(payload.create).not.toHaveBeenCalled();

    // Basic assertions on result shape
    expect(result).toHaveProperty("seed");
    expect(Array.isArray(result.winners)).toBe(true);
    expect(result.totalParticipants).toBe(participants.length);
  });

  it("deterministic: same seed produces identical winners across runs when seed is mocked", async () => {
    const participants = [
      { id: "t1", user: "alice", count: 5, boostLuck: 0 },
      { id: "t2", user: "bob", count: 2, boostLuck: 0 },
      { id: "t3", user: "carol", count: 1, boostLuck: 0 },
    ];
    const payloadA = createFakePayload(participants);
    const payloadB = createFakePayload(participants);

    const engineA = new LotteryEngine(payloadA);
    const engineB = new LotteryEngine(payloadB);

    // Use a fixed seed buffer for both runs
    const fixedSeed = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
    vi.spyOn(crypto, "randomBytes")
      .mockImplementationOnce(() => fixedSeed)
      .mockImplementationOnce(() => fixedSeed);

    const r1 = await engineA.runLottery("lottery-2", {
      numWinners: 2,
      uniqueWinners: true,
      dryRun: true,
    });
    const r2 = await engineB.runLottery("lottery-2", {
      numWinners: 2,
      uniqueWinners: true,
      dryRun: true,
    });

    // Seeds must match and winners arrays must be deeply equal
    expect(r1.seed).toBe(r2.seed);
    expect(r1.winners).toEqual(r2.winners);

    // Ensure winners are unique (per participant constraint)
    const winnerIds = r1.winners.map((w: any) => w.user);
    const unique = new Set(winnerIds);
    expect(unique.size).toBe(winnerIds.length);
  });

  it("enforces unique winners: a user cannot win more than once in the same draw", async () => {
    // create participants where one user has many tickets
    const participants = [
      { id: "t1", user: "heavy", count: 50, boostLuck: 0 },
      { id: "t2", user: "userA", count: 2, boostLuck: 0 },
      { id: "t3", user: "userB", count: 1, boostLuck: 0 },
      { id: "t4", user: "userC", count: 1, boostLuck: 0 },
    ];
    const payload = createFakePayload(participants);
    const engine = new LotteryEngine(payload);

    // fixed seed so draws deterministic for the assertion
    vi.spyOn(crypto, "randomBytes").mockReturnValue(
      Buffer.from("feedfacecafebeef0011223344556677", "hex")
    );

    const numWinners = 3;
    const res = await engine.runLottery("lottery-3", {
      numWinners,
      uniqueWinners: true,
      dryRun: true,
    });

    // Expect exactly numWinners (or capped by participant count)
    expect(res.winners.length).toBe(Math.min(numWinners, participants.length));

    // Unique winners check
    const ids = res.winners.map((w: any) => w.user);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
