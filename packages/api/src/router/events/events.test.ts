import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";
import { call } from "@orpc/server";

import { clearShowsCache } from "../../lib/shows/cache";
import type { ShowsConfig } from "../../lib/shows/config";
import type {
  ShowsEvent,
  ShowsInventory,
  ShowsSession,
} from "../../lib/shows/types";
import {
  createFakePayload,
  createTestClient,
  expectError,
  mockContext,
} from "../../test-utils";
import { eventsRouter } from "./index";

type Reply = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Bun's `fetch` carries a `preconnect` member, so a bare function is not
 * assignable to `typeof fetch`; this keeps the mocks honest without a cast.
 */
function asFetch(
  handler: (input: unknown, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return Object.assign(handler, { preconnect: () => undefined });
}

function fakeShows(replies: Reply[]) {
  const calls: string[] = [];

  const fetchImpl = asFetch((input) => {
    calls.push(String(input));
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)] ?? {};

    return Promise.resolve(
      Response.json(reply.body ?? {}, {
        status: reply.status ?? 200,
        headers: reply.headers,
      })
    );
  });

  return { calls, fetchImpl };
}

/** A context whose Shows client is a fake network, not the real one. */
function setup(replies: Reply[]) {
  const payload = createFakePayload();
  const { calls, fetchImpl } = fakeShows(replies);
  const shows: ShowsConfig = {
    credential: "test-credential",
    baseUrl: "https://shows.test",
    fetchImpl,
  };

  return { calls, payload, ctx: mockContext({ payload, shows }) };
}

function event(overrides: Partial<ShowsEvent> = {}): ShowsEvent {
  return {
    id: "evt-1",
    title: "Lagos Live",
    description: "A show",
    venue: "Eko Centre",
    city: "Lagos",
    category: "music",
    imageUrl: "https://img.test/1.jpg",
    startsAt: "2026-12-01T19:00:00.000Z",
    endsAt: "2026-12-01T22:00:00.000Z",
    currency: "NGN",
    fromPriceMinor: 500_000,
    free: false,
    onSale: true,
    ...overrides,
  };
}

type SessionFixture = ShowsSession & { revision?: string | null };

function session(overrides: Partial<SessionFixture> = {}): SessionFixture {
  return {
    id: "sess-1",
    eventId: "evt-1",
    startsAt: "2026-12-01T19:00:00.000Z",
    endsAt: "2026-12-01T22:00:00.000Z",
    currency: "NGN",
    fromPriceMinor: 500_000,
    revision: "rev-7",
    ...overrides,
  };
}

function inventory(overrides: Partial<ShowsInventory> = {}): ShowsInventory {
  return {
    eventId: "evt-1",
    sessionId: "sess-1",
    currency: "NGN",
    updatedAt: "2026-11-17T10:00:00.000Z",
    available: 12,
    soldOut: false,
    tiers: [
      {
        id: "tier-1",
        name: "Regular",
        priceMinor: 500_000,
        available: 12,
        soldOut: false,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  clearShowsCache();
});

afterEach(() => {
  setSystemTime();
  clearShowsCache();
});

describe("eventsRouter.list", () => {
  it("maps an event for the app", async () => {
    const { ctx } = setup([
      { body: { data: [event()], nextCursor: "next-page" } },
    ]);

    const result = await call(eventsRouter.list, {}, { context: ctx });

    expect(result).toEqual({
      data: [
        {
          id: "evt-1",
          title: "Lagos Live",
          description: "A show",
          venue: "Eko Centre",
          city: "Lagos",
          category: "music",
          imageUrl: "https://img.test/1.jpg",
          startsAt: "2026-12-01T19:00:00.000Z",
          endsAt: "2026-12-01T22:00:00.000Z",
          currency: "NGN",
          fromPriceMinor: 500_000,
          free: false,
          onSale: true,
          pointsFrom: 150,
        },
      ],
      nextCursor: "next-page",
    });
  });

  it("estimates points from the from-price, and none when free or unpriced", async () => {
    const { ctx } = setup([
      {
        body: {
          data: [
            event({ id: "priced", fromPriceMinor: 850_000 }),
            event({ id: "free", free: true, fromPriceMinor: 500_000 }),
            event({ id: "unpriced", fromPriceMinor: null }),
          ],
        },
      },
    ]);

    const result = await call(eventsRouter.list, {}, { context: ctx });

    expect(result.data.map((item) => item.pointsFrom)).toEqual([250, 0, 0]);
  });

  it("asks Shows for naira prices", async () => {
    const { ctx, calls } = setup([{ body: { data: [] } }]);

    await call(eventsRouter.list, { q: "live" }, { context: ctx });

    expect(calls[0]).toContain("q=live");
    expect(calls[0]).toContain("display_currency=NGN");
  });

  it("serves a list from cache within five minutes and refetches after", async () => {
    setSystemTime(new Date("2026-11-17T10:00:00.000Z"));
    const { ctx, calls } = setup([{ body: { data: [event()] } }]);

    await call(eventsRouter.list, { q: "live" }, { context: ctx });
    setSystemTime(new Date("2026-11-17T10:04:59.000Z"));
    await call(eventsRouter.list, { q: "live" }, { context: ctx });
    expect(calls).toHaveLength(1);

    setSystemTime(new Date("2026-11-17T10:05:00.001Z"));
    await call(eventsRouter.list, { q: "live" }, { context: ctx });
    expect(calls).toHaveLength(2);
  });

  it("keys the cache by the whole query, not just the event id", async () => {
    const { ctx, calls } = setup([{ body: { data: [event()] } }]);

    await call(eventsRouter.list, { q: "live" }, { context: ctx });
    await call(eventsRouter.list, { q: "jazz" }, { context: ctx });

    expect(calls).toHaveLength(2);
  });

  it("drops events that report another currency", async () => {
    const { ctx } = setup([
      {
        body: {
          data: [
            event({ id: "naira" }),
            event({ id: "dollars", currency: "USD" }),
            event({ id: "unstated", currency: null }),
          ],
        },
      },
    ]);

    const result = await call(eventsRouter.list, {}, { context: ctx });

    expect(result.data.map((item) => item.id)).toEqual(["naira", "unstated"]);
  });
});

describe("eventsRouter.get", () => {
  it("returns the event's sessions", async () => {
    const { ctx } = setup([{ body: event() }, { body: { data: [session()] } }]);

    const result = await call(
      eventsRouter.get,
      { id: "evt-1" },
      { context: ctx }
    );

    expect(result.sessions).toEqual([
      {
        id: "sess-1",
        eventId: "evt-1",
        startsAt: "2026-12-01T19:00:00.000Z",
        endsAt: "2026-12-01T22:00:00.000Z",
        currency: "NGN",
        fromPriceMinor: 500_000,
        revision: "rev-7",
      },
    ]);
  });

  it("maps one event through a test client", async () => {
    const { ctx } = setup([{ body: event() }, { body: { data: [] } }]);

    const client = createTestClient(eventsRouter, ctx);
    const result = await client.get({ id: "evt-1" });

    expect(result.id).toBe("evt-1");
    expect(result.currency).toBe("NGN");
    expect(result.sessions).toEqual([]);
  });

  it("hides an event priced in another currency", async () => {
    const { ctx } = setup([
      { body: event({ currency: "USD" }) },
      { body: { data: [] } },
    ]);

    const error = await expectError(
      call(eventsRouter.get, { id: "evt-1" }, { context: ctx })
    );

    expect(error.code).toBe("NOT_FOUND");
  });
});

describe("eventsRouter.inventory", () => {
  it("maps tiers and refreshes after fifteen seconds", async () => {
    setSystemTime(new Date("2026-11-17T10:00:00.000Z"));
    const { ctx, calls } = setup([
      { body: inventory() },
      { body: inventory({ available: 4 }) },
    ]);

    const first = await call(
      eventsRouter.inventory,
      { eventId: "evt-1", sessionId: "sess-1" },
      { context: ctx }
    );
    expect(first.tiers[0]?.priceMinor).toBe(500_000);

    setSystemTime(new Date("2026-11-17T10:00:14.000Z"));
    await call(
      eventsRouter.inventory,
      { eventId: "evt-1", sessionId: "sess-1" },
      { context: ctx }
    );
    expect(calls).toHaveLength(1);

    setSystemTime(new Date("2026-11-17T10:00:15.001Z"));
    const refreshed = await call(
      eventsRouter.inventory,
      { eventId: "evt-1", sessionId: "sess-1" },
      { context: ctx }
    );
    expect(calls).toHaveLength(2);
    expect(refreshed.available).toBe(4);
  });

  it("keeps separate entries for different sessions", async () => {
    const { ctx, calls } = setup([{ body: inventory() }]);

    await call(
      eventsRouter.inventory,
      { eventId: "evt-1", sessionId: "sess-1" },
      { context: ctx }
    );
    await call(
      eventsRouter.inventory,
      { eventId: "evt-1", sessionId: "sess-2" },
      { context: ctx }
    );

    expect(calls).toHaveLength(2);
  });

  it("forwards the session revision to Shows", async () => {
    const { ctx, calls } = setup([{ body: inventory() }]);

    await call(
      eventsRouter.inventory,
      { eventId: "evt-1", sessionId: "sess-1", revision: "rev-7" },
      { context: ctx }
    );

    expect(calls[0]).toContain("revision=rev-7");
  });
});

describe("Shows error mapping", () => {
  it("maps 404 to NOT_FOUND", async () => {
    const { ctx } = setup([
      { status: 404, body: { error: { code: "not_found" } } },
    ]);

    const error = await expectError(
      call(eventsRouter.get, { id: "missing" }, { context: ctx })
    );

    expect(error.code).toBe("NOT_FOUND");
  });

  it("maps 422 to BAD_REQUEST", async () => {
    const { ctx } = setup([
      { status: 422, body: { error: { code: "invalid_input" } } },
    ]);

    const error = await expectError(
      call(eventsRouter.list, { q: "live" }, { context: ctx })
    );

    expect(error.code).toBe("BAD_REQUEST");
  });

  it("maps 429 to TOO_MANY_REQUESTS", async () => {
    const { ctx } = setup([
      {
        status: 429,
        body: { error: { code: "rate_limited" } },
        headers: { "retry-after": "0" },
      },
    ]);

    const error = await expectError(
      call(eventsRouter.list, { q: "live" }, { context: ctx })
    );

    expect(error.code).toBe("TOO_MANY_REQUESTS");
  });

  it("never forwards a Shows message or the credential", async () => {
    const { ctx } = setup([
      {
        status: 401,
        body: {
          error: {
            code: "unauthorized",
            message: "invalid token test-credential",
          },
        },
      },
    ]);

    const error = await expectError(
      call(eventsRouter.list, {}, { context: ctx })
    );

    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.message).not.toContain("test-credential");
    expect(error.message).not.toContain("invalid token");
  });
});

describe("missing credential", () => {
  it("returns a defined SERVICE_UNAVAILABLE instead of throwing", async () => {
    const ctx = mockContext({
      payload: createFakePayload(),
      shows: null,
    });

    const error = await expectError(
      call(eventsRouter.list, {}, { context: ctx })
    );

    expect(error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
