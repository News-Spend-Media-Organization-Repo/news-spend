import { afterEach, describe, expect, it } from "bun:test";

import {
  createCheckout,
  getEvent,
  getPurchase,
  listEvents,
  ShowsApiError,
  showsRequest,
} from "./client";
import { showsConfigFromEnv } from "./config";

type Reply = {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
};

type Call = { url: string; init: RequestInit };

/**
 * Bun's `fetch` carries a `preconnect` member, so a bare function is not
 * assignable to `typeof fetch`; this keeps the mocks honest without a cast.
 */
function asFetch(
  handler: (input: unknown, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return Object.assign(handler, { preconnect: () => undefined });
}

function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];

  const fetchImpl = asFetch((input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)] ?? {};

    if (reply.text !== undefined) {
      return Promise.resolve(
        new Response(reply.text, {
          status: reply.status ?? 200,
          headers: reply.headers,
        })
      );
    }

    return Promise.resolve(
      Response.json(reply.body ?? {}, {
        status: reply.status ?? 200,
        headers: reply.headers,
      })
    );
  });

  return { calls, fetchImpl };
}

function headersOf(call: Call | undefined): Headers {
  return new Headers(call?.init.headers);
}

async function rejects(promise: Promise<unknown>): Promise<ShowsApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ShowsApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the request to reject");
}

describe("showsRequest", () => {
  it("sends the credential as a bearer token to the default base url", async () => {
    const { calls, fetchImpl } = fakeFetch([{ body: { data: [] } }]);

    await showsRequest(
      { credential: "secret-cred", fetchImpl },
      "/products/ticketing/events"
    );

    expect(calls[0]?.url).toBe(
      "https://api.shows.ng/v1/products/ticketing/events"
    );
    expect(headersOf(calls[0]).get("authorization")).toBe("Bearer secret-cred");
  });

  it("joins an overridden base url without doubling the slash", async () => {
    const { calls, fetchImpl } = fakeFetch([{ body: {} }]);

    await showsRequest(
      {
        credential: "c",
        baseUrl: "https://sandbox.example/v1/",
        fetchImpl,
      },
      "products/ticketing/events"
    );

    expect(calls[0]?.url).toBe(
      "https://sandbox.example/v1/products/ticketing/events"
    );
  });

  it("encodes the query and drops undefined values", async () => {
    const { calls, fetchImpl } = fakeFetch([{ body: { data: [] } }]);

    await showsRequest(
      { credential: "c", fetchImpl },
      "/products/ticketing/events",
      {
        query: {
          q: "lagos concert",
          limit: 20,
          free: false,
          cursor: undefined,
        },
      }
    );

    expect(calls[0]?.url).toBe(
      "https://api.shows.ng/v1/products/ticketing/events?q=lagos+concert&limit=20&free=false"
    );
  });

  it("sends the idempotency key it was given", async () => {
    const { calls, fetchImpl } = fakeFetch([{ body: { reference: "p-1" } }]);

    await showsRequest({ credential: "c", fetchImpl }, "/checkouts", {
      method: "POST",
      body: { eventId: "e-1" },
      idempotencyKey: "uuid-1",
    });

    expect(headersOf(calls[0]).get("idempotency-key")).toBe("uuid-1");
    expect(headersOf(calls[0]).get("content-type")).toBe("application/json");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ eventId: "e-1" }));
  });

  it("maps a 409 to ShowsApiError with its code and request id", async () => {
    const { fetchImpl } = fakeFetch([
      {
        status: 409,
        body: {
          error: { code: "insufficient_stock", message: "Sold out" },
        },
        headers: { "x-request-id": "req-9" },
      },
    ]);

    const error = await rejects(
      showsRequest(
        { credential: "secret-cred", fetchImpl },
        "/products/ticketing/events"
      )
    );

    expect(error).toMatchObject({
      status: 409,
      code: "insufficient_stock",
      requestId: "req-9",
    });
    expect(error.message).toBe("Sold out");
    expect(error.message).not.toContain("secret-cred");
  });

  it("falls back to an http code when the error body is not json", async () => {
    const { fetchImpl } = fakeFetch([{ status: 502, text: "bad gateway" }]);

    const error = await rejects(
      showsRequest({ credential: "c", fetchImpl }, "/products/ticketing/events")
    );

    expect(error).toMatchObject({ status: 502, code: "http_502" });
  });

  it("retries a GET on 503 and then succeeds", async () => {
    const { calls, fetchImpl } = fakeFetch([
      { status: 503, headers: { "retry-after": "0" } },
      { status: 503, headers: { "retry-after": "0" } },
      { body: { data: [] } },
    ]);

    const result = await showsRequest(
      { credential: "c", fetchImpl },
      "/products/ticketing/events"
    );

    expect(result).toEqual({ data: [] });
    expect(calls.length).toBe(3);
  });

  it("does not retry a POST, even a 5xx one", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 503 }]);

    const error = await rejects(
      showsRequest({ credential: "c", fetchImpl }, "/checkouts", {
        method: "POST",
        body: { eventId: "e-1" },
        idempotencyKey: "uuid-1",
      })
    );

    expect(error).toMatchObject({ status: 503, code: "http_503" });
    expect(calls.length).toBe(1);
  });

  it("maps a network failure to a typed error", async () => {
    const fetchImpl = asFetch(() =>
      Promise.reject(new TypeError("connection refused"))
    );

    const error = await rejects(
      showsRequest({ credential: "c", fetchImpl }, "/products/ticketing/events")
    );

    expect(error).toMatchObject({ status: 0, code: "network_error" });
  });

  it("returns undefined for an empty 204 response", async () => {
    const { fetchImpl } = fakeFetch([{ status: 204 }]);

    const result = await showsRequest(
      { credential: "c", fetchImpl },
      "/checkouts/abc"
    );

    expect(result).toBeUndefined();
  });
});

describe("typed calls", () => {
  it("builds the purchase, event and checkout paths", async () => {
    const { calls, fetchImpl } = fakeFetch([
      { body: { data: [] } },
      { body: { id: "e-1" } },
      {
        body: { reference: "p-1", checkoutUrl: "https://pay", expiresAt: "x" },
      },
      { body: { reference: "p-1" } },
    ]);
    const config = { credential: "c", fetchImpl };

    await listEvents(config, { q: "jazz" });
    await getEvent(config, "e 1");
    await createCheckout(
      config,
      {
        eventId: "e-1",
        sessionId: "s-1",
        items: [{ tierId: "t-1", quantity: 1 }],
      },
      "uuid-1"
    );
    await getPurchase(config, "p-1");

    expect(calls.map((call) => call.url)).toEqual([
      "https://api.shows.ng/v1/products/ticketing/events?q=jazz",
      "https://api.shows.ng/v1/products/ticketing/events/e%201",
      "https://api.shows.ng/v1/checkouts",
      "https://api.shows.ng/v1/purchases/p-1",
    ]);
    expect(calls[2]?.init.method).toBe("POST");
    expect(headersOf(calls[2]).get("idempotency-key")).toBe("uuid-1");
  });
});

describe("showsConfigFromEnv", () => {
  afterEach(() => {
    delete process.env.SHOWS_API_CREDENTIAL;
  });

  it("returns null when the credential is missing", () => {
    expect(showsConfigFromEnv()).toBeNull();
  });

  it("reads the credential from the environment", () => {
    process.env.SHOWS_API_CREDENTIAL = "secret-cred";

    expect(showsConfigFromEnv()).toEqual({ credential: "secret-cred" });
  });
});
