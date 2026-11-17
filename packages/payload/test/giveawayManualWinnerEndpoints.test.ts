import { afterEach, describe, expect, test } from "bun:test";

import { Giveaways } from "../src/collections/giveaway/Giveaways";
import {
  GiveawayEngine,
  GiveawayEngineError,
  type ManualWinnerInput,
} from "../src/lib/giveaway/GiveawayEngine";

const endpoint = (path: string) => {
  const found = (Giveaways.endpoints || []).find(
    (e: { path: string }) => e.path === path
  );
  if (!found) {
    throw new Error(`missing endpoint ${path}`);
  }
  return found.handler;
};

/** A payload that fails the test if a refused request ever reaches it. */
const untouchable = new Proxy(
  {},
  {
    get: () => {
      throw new Error("payload must not be reached");
    },
  }
);

const reqFor = ({
  user,
  body = {},
  id = "g1",
  payload = untouchable,
}: {
  user: unknown;
  body?: unknown;
  /** `null` sends no route id at all. */
  id?: string | null;
  payload?: unknown;
}) =>
  ({
    user,
    routeParams: id ? { id } : {},
    searchParams: new URLSearchParams(),
    json: async () => body,
    payload,
  }) as never;

const superAdmin = {
  collection: "admins",
  role: "super-admin",
  id: "a1",
  email: "boss@example.invalid",
};
const logger = { warn: () => undefined, error: () => undefined };

const original = GiveawayEngine.prototype.addManualWinner;
afterEach(() => {
  GiveawayEngine.prototype.addManualWinner = original;
});

describe("manual winner endpoints", () => {
  for (const path of ["/:id/participants", "/:id/manual-winner"]) {
    test(`${path} rejects a content-manager and a partner with 403`, async () => {
      for (const role of ["content-manager", "partner"]) {
        const res = await endpoint(path)(
          reqFor({ user: { collection: "admins", role } })
        );
        expect(res.status).toBe(403);
      }
    });

    test(`${path} rejects a missing id with 400`, async () => {
      const res = await endpoint(path)(reqFor({ user: superAdmin, id: null }));
      expect(res.status).toBe(400);
    });
  }

  test("rejects a missing prizeRowId and a 201-character reason with 400", async () => {
    const handler = endpoint("/:id/manual-winner");

    const missing = await handler(
      reqFor({ user: superAdmin, body: { userKey: "u1" } })
    );
    expect(missing.status).toBe(400);

    const long = await handler(
      reqFor({
        user: superAdmin,
        body: { userKey: "u1", prizeRowId: "p1", reason: "x".repeat(201) },
      })
    );
    expect(long.status).toBe(400);
  });

  test("maps an engine refusal to 409 with its code", async () => {
    GiveawayEngine.prototype.addManualWinner = async () => {
      throw new GiveawayEngineError(
        "Already a winner.",
        "MANUAL_WINNER_ALREADY_WINNER"
      );
    };

    const res = await endpoint("/:id/manual-winner")(
      reqFor({
        user: superAdmin,
        body: { userKey: "u1", prizeRowId: "p1" },
        payload: { logger },
      })
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      message: "Already a winner.",
      code: "MANUAL_WINNER_ALREADY_WINNER",
    });
  });

  test("passes addedBy from the signed-in admin", async () => {
    const calls: { giveawayId: string; input: ManualWinnerInput }[] = [];
    GiveawayEngine.prototype.addManualWinner = async (giveawayId, input) => {
      calls.push({ giveawayId, input });
      return { winnerId: "w1", phase: "post_draw", unitsRemaining: 0 };
    };

    const res = await endpoint("/:id/manual-winner")(
      reqFor({
        user: superAdmin,
        body: { userKey: "u1", prizeRowId: "p1", reason: "  partner rep  " },
        payload: { logger },
      })
    );

    expect(res.status).toBe(200);
    expect(calls).toEqual([
      {
        giveawayId: "g1",
        input: {
          userKey: "u1",
          prizeRowId: "p1",
          addedBy: "boss@example.invalid",
          reason: "partner rep",
        },
      },
    ]);
    const body = (await res.json()) as { message: string; winnerId: string };
    expect(body.winnerId).toBe("w1");
    // A post-draw seat must not imply the report already covers them.
    expect(body.message).toContain("Winner Report");
  });
});
