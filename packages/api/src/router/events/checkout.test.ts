import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";
import { call } from "@orpc/server";

import type { ShowsConfig } from "../../lib/shows/config";
import type {
  ShowsCheckout,
  ShowsInventory,
  ShowsPurchase,
} from "../../lib/shows/types";
import {
  createFakePayload,
  type Doc,
  expectError,
  type FakePayload,
  mockContext,
} from "../../test-utils";
import { eventsRouter } from "./index";

type Reply = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  throws?: unknown;
};

type Recorded = {
  url: string;
  method: string;
  key: string | null;
  body: string | null;
};

/** Bun's fetch carries `preconnect`, so a bare function is not `typeof fetch`. */
function asFetch(
  handler: (input: unknown, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return Object.assign(handler, { preconnect: () => undefined });
}

const BUYER = {
  id: "user-1",
  name: "Ada Obi",
  email: "ada@test.dev",
  phone: "+2348012345678",
  isAnonymous: false,
};

const CHECKOUT: ShowsCheckout = {
  reference: "ref-1",
  checkoutUrl: "https://pay.test/ref-1",
  expiresAt: "2026-11-17T10:15:00.000Z",
};

const INPUT = {
  eventId: "evt-1",
  sessionId: "sess-1",
  sessionRevision: "rev-7",
  tickets: [{ type: "tier-1", quantity: 2 }],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type SetupOptions = {
  replies?: Reply[];
  orders?: Doc[];
  user?: Record<string, unknown> | null;
  shows?: ShowsConfig | null;
  onFetch?: (call: Recorded, payload: FakePayload) => void;
};

function setup({
  replies = [],
  orders = [],
  user = BUYER,
  shows,
  onFetch,
}: SetupOptions = {}) {
  const payload = createFakePayload({
    collections: { "ticket-orders": orders },
  });
  const calls: Recorded[] = [];

  const fetchImpl = asFetch((input, init) => {
    const headers = new Headers(init?.headers);
    const callRecord: Recorded = {
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      key: headers.get("idempotency-key"),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(callRecord);

    const reply = replies[Math.min(calls.length - 1, replies.length - 1)] ?? {};
    onFetch?.(callRecord, payload);

    if (reply.throws !== undefined) {
      throw reply.throws;
    }

    return Promise.resolve(
      Response.json(reply.body ?? {}, {
        status: reply.status ?? 200,
        headers: reply.headers,
      })
    );
  });

  const ctx = mockContext({
    payload,
    shows:
      shows === undefined
        ? {
            credential: "test-credential",
            baseUrl: "https://shows.test",
            fetchImpl,
          }
        : shows,
    user: user as never,
  });

  return { calls, ctx, payload };
}

function inventory(overrides: Partial<ShowsInventory> = {}): ShowsInventory {
  return {
    eventId: "evt-1",
    sessionId: "sess-1",
    currency: "NGN",
    updatedAt: "2026-11-17T10:00:00.000Z",
    available: 20,
    soldOut: false,
    tiers: [
      {
        id: "tier-1",
        name: "Regular",
        priceMinor: 500_000,
        available: 10,
        soldOut: false,
      },
      {
        id: "tier-2",
        name: "VIP",
        priceMinor: 1_000_000,
        available: 4,
        soldOut: false,
      },
    ],
    ...overrides,
  };
}

function order(overrides: Doc = {}): Doc {
  return {
    id: "order-1",
    user: "user-1",
    clientRef: "client-1",
    idempotencyKey: "key-1",
    reference: "ref-1",
    state: "paid",
    eventId: "evt-1",
    sessionId: "sess-1",
    items: [{ type: "tier-1", quantity: 2, unitPriceMinor: 500_000 }],
    amountMinor: 1_000_000,
    currency: "NGN",
    refundedMinor: 0,
    pointsAwarded: 0,
    lastSyncedAt: "2026-11-17T09:00:00.000Z",
    createdAt: "2026-11-17T09:00:00.000Z",
    ...overrides,
  };
}

function purchase(overrides: Partial<ShowsPurchase> = {}): ShowsPurchase {
  return {
    reference: "ref-1",
    orderReference: "ord-1",
    state: "paid",
    amountMinor: 1_000_000,
    currency: "NGN",
    refundedMinor: 0,
    ...overrides,
  };
}

const NOW = new Date("2026-11-17T10:00:00.000Z");

beforeEach(() => {
  setSystemTime(NOW);
});

afterEach(() => {
  setSystemTime();
});

describe("eventsRouter.checkout", () => {
  it("writes the order row before calling Shows", async () => {
    const atPost: Array<{
      state: unknown;
      reference: unknown;
      rows: number;
    }> = [];

    const { calls, ctx, payload } = setup({
      replies: [{ body: inventory() }, { body: CHECKOUT }],
      onFetch: (call, fake) => {
        if (call.method !== "POST") {
          return;
        }
        const rows = fake.docs("ticket-orders");
        const row = rows[0];
        atPost.push({
          rows: rows.length,
          state: row?.state,
          reference: row?.reference,
        });
      },
    });

    const result = await call(eventsRouter.checkout, INPUT, { context: ctx });

    expect(result).toEqual(CHECKOUT);
    expect(atPost).toEqual([
      { rows: 1, state: "pending", reference: undefined },
    ]);

    const [row] = payload.docs("ticket-orders");
    expect(row).toMatchObject({
      user: "user-1",
      eventId: "evt-1",
      sessionId: "sess-1",
      state: "pending",
      currency: "NGN",
      amountMinor: 1_000_000,
      reference: "ref-1",
      buyer: {
        name: "Ada Obi",
        email: "ada@test.dev",
        phone: "+2348012345678",
      },
      items: [{ type: "tier-1", quantity: 2, unitPriceMinor: 500_000 }],
    });
    expect(row?.clientRef).toMatch(UUID);

    const post = calls.find((entry) => entry.method === "POST");
    expect(post?.key).toBe(row?.idempotencyKey);

    const orderOps = payload.calls
      .filter((entry) => entry.collection === "ticket-orders")
      .map((entry) => entry.op);
    expect(orderOps).toEqual(["find", "create", "update"]);
  });

  it("retries product_outcome_unknown once with the same key and body", async () => {
    const { calls, ctx, payload } = setup({
      replies: [
        { body: inventory() },
        {
          status: 500,
          body: {
            error: { code: "product_outcome_unknown", message: "unknown" },
          },
        },
        { body: CHECKOUT },
      ],
    });

    const result = await call(eventsRouter.checkout, INPUT, { context: ctx });

    expect(result.reference).toBe("ref-1");
    const posts = calls.filter((entry) => entry.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[0]?.key).toBe(posts[1]?.key);
    expect(posts[0]?.body).toBe(posts[1]?.body);
    expect(payload.docs("ticket-orders")).toHaveLength(1);
  });

  it("reuses a pending order younger than fifteen minutes", async () => {
    const { calls, ctx, payload } = setup({
      replies: [
        { body: inventory() },
        { body: CHECKOUT },
        { body: inventory() },
        { body: CHECKOUT },
      ],
    });

    const first = await call(eventsRouter.checkout, INPUT, { context: ctx });
    setSystemTime(new Date(NOW.getTime() + 5 * 60 * 1000));
    const second = await call(eventsRouter.checkout, INPUT, { context: ctx });

    expect(second).toEqual(first);
    expect(payload.docs("ticket-orders")).toHaveLength(1);

    const posts = calls.filter((entry) => entry.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[1]?.key).toBe(posts[0]?.key);
    expect(posts[1]?.body).toBe(posts[0]?.body);
  });

  it("creates a new checkout when the pending order is older than fifteen minutes", async () => {
    const { calls, ctx, payload } = setup({
      replies: [
        { body: inventory() },
        { body: CHECKOUT },
        { body: inventory() },
        {
          body: {
            reference: "ref-2",
            checkoutUrl: "https://pay.test/ref-2",
            expiresAt: "2026-11-17T10:31:00.000Z",
          },
        },
      ],
    });

    const first = await call(eventsRouter.checkout, INPUT, { context: ctx });
    setSystemTime(new Date(NOW.getTime() + 16 * 60 * 1000));
    const second = await call(eventsRouter.checkout, INPUT, { context: ctx });

    expect(first.reference).toBe("ref-1");
    expect(second.reference).toBe("ref-2");
    expect(payload.docs("ticket-orders")).toHaveLength(2);

    const posts = calls.filter((entry) => entry.method === "POST");
    expect(posts[1]?.key).not.toBe(posts[0]?.key);
  });

  it("leaves a pending row after a timeout so the next attempt reuses its key", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    const { calls, ctx, payload } = setup({
      replies: [
        { body: inventory() },
        { throws: timeout },
        { body: inventory() },
        { body: CHECKOUT },
      ],
    });

    const error = await expectError(
      call(eventsRouter.checkout, INPUT, { context: ctx })
    );
    expect(error.code).toBe("INTERNAL_SERVER_ERROR");

    const [pending] = payload.docs("ticket-orders");
    expect(pending).toMatchObject({ state: "pending" });
    expect(pending?.reference).toBeUndefined();

    const result = await call(eventsRouter.checkout, INPUT, { context: ctx });

    expect(result.reference).toBe("ref-1");
    expect(payload.docs("ticket-orders")).toHaveLength(1);
    const posts = calls.filter((entry) => entry.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[1]?.key).toBe(posts[0]?.key);
  });

  it("refuses a guest without touching Shows", async () => {
    const { calls, ctx, payload } = setup({
      user: { ...BUYER, id: "guest-1", isAnonymous: true },
    });

    const error = await expectError(
      call(eventsRouter.checkout, INPUT, { context: ctx })
    );

    expect(error.code).toBe("FORBIDDEN");
    expect(calls).toHaveLength(0);
    expect(payload.docs("ticket-orders")).toHaveLength(0);
  });

  it("maps insufficient stock to a defined error with fixed copy", async () => {
    const { ctx, payload } = setup({
      replies: [
        { body: inventory() },
        {
          status: 409,
          body: {
            error: {
              code: "insufficient_stock",
              message: "tier tier-1 has 1 left (secret detail)",
            },
          },
        },
      ],
    });

    const error = await expectError(
      call(eventsRouter.checkout, INPUT, { context: ctx })
    );

    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(error.message).not.toContain("secret detail");
    expect(payload.docs("ticket-orders")[0]?.state).toBe("failed");
  });

  it("refuses a sold-out tier before writing or calling Shows", async () => {
    const { calls, ctx, payload } = setup({
      replies: [
        {
          body: inventory({
            tiers: [
              {
                id: "tier-1",
                name: "Regular",
                priceMinor: 500_000,
                available: 0,
                soldOut: true,
              },
            ],
          }),
        },
      ],
    });

    const error = await expectError(
      call(eventsRouter.checkout, INPUT, { context: ctx })
    );

    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(calls).toHaveLength(1);
    expect(payload.docs("ticket-orders")).toHaveLength(0);
  });

  it("caps a ticket type at four", async () => {
    const { ctx } = setup({ replies: [{ body: inventory() }] });

    const error = await expectError(
      call(
        eventsRouter.checkout,
        {
          ...INPUT,
          tickets: [{ type: "tier-1", quantity: 5 }],
        },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
  });

  it("returns SERVICE_UNAVAILABLE when Shows is unconfigured", async () => {
    const { calls, ctx, payload } = setup({ shows: null });

    const error = await expectError(
      call(eventsRouter.checkout, INPUT, { context: ctx })
    );

    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(calls).toHaveLength(0);
    expect(payload.docs("ticket-orders")).toHaveLength(0);
  });
});

describe("eventsRouter.order", () => {
  it("returns only the caller's own order", async () => {
    const { calls, ctx } = setup({
      orders: [
        order({ id: "order-1", user: "user-1", reference: "ref-1" }),
        order({ id: "order-2", user: "user-2", reference: "ref-2" }),
      ],
    });

    const mine = await call(
      eventsRouter.order,
      { reference: "ref-1" },
      { context: ctx }
    );
    expect(mine.reference).toBe("ref-1");

    const error = await expectError(
      call(eventsRouter.order, { reference: "ref-2" }, { context: ctx })
    );
    expect(error.code).toBe("NOT_FOUND");
    expect(calls).toHaveLength(0);
  });

  it("refreshes a pending order after thirty seconds", async () => {
    const { calls, ctx, payload } = setup({
      orders: [
        order({
          state: "pending",
          lastSyncedAt: "2026-11-17T09:59:29.000Z",
        }),
      ],
      replies: [{ body: purchase() }],
    });

    const result = await call(
      eventsRouter.order,
      { reference: "ref-1" },
      { context: ctx }
    );

    expect(result.state).toBe("paid");
    expect(result.orderReference).toBe("ord-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/purchases/ref-1");
    expect(payload.docs("ticket-orders")[0]).toMatchObject({
      state: "paid",
      lastSyncedAt: NOW.toISOString(),
    });
  });

  it("skips the refresh when the pending order is fresh", async () => {
    const { calls, ctx, payload } = setup({
      orders: [
        order({
          state: "pending",
          lastSyncedAt: "2026-11-17T09:59:40.000Z",
        }),
      ],
    });

    const result = await call(
      eventsRouter.order,
      { reference: "ref-1" },
      { context: ctx }
    );

    expect(result.state).toBe("pending");
    expect(calls).toHaveLength(0);
    expect(payload.docs("ticket-orders")[0]?.state).toBe("pending");
  });

  it("returns SERVICE_UNAVAILABLE when Shows is unconfigured", async () => {
    const { ctx } = setup({
      shows: null,
      orders: [order({ state: "paid" })],
    });

    const error = await expectError(
      call(eventsRouter.order, { reference: "ref-1" }, { context: ctx })
    );

    expect(error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
