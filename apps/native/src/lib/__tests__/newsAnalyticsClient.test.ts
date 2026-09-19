const mockStore = new Map<string, string>();
const mockTrack = jest.fn();

jest.mock("#/utils/storage", () => ({
  storage: {
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => {
      mockStore.set(key, value);
    },
  },
}));

jest.mock("../orpc", () => ({
  client: {
    news: { analytics: { track: (...args: unknown[]) => mockTrack(...args) } },
  },
}));

/**
 * An error shaped like the ones oRPC's client throws: `name` and `code`, and no
 * HTTP status. Confirmed by calling a real server (beta.28); the library is ESM
 * only, which Jest does not transform, so the class itself is not imported.
 */
class ORPCError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ORPCError";
    this.code = code;
  }
}

type Client = typeof import("../newsAnalyticsClient")["newsAnalyticsClient"];

const QUEUE_KEY = "news_analytics_queue";
const MINUTE = 60 * 1000;

const load = (): Client => {
  let client!: Client;
  jest.isolateModules(() => {
    client = require("../newsAnalyticsClient").newsAnalyticsClient;
  });
  return client;
};

const makeEvent = (articleId: string, userId?: string) => ({
  articleId,
  event: "view" as const,
  deviceId: "device-1",
  userId,
});

const queued = (): Record<string, unknown>[] =>
  JSON.parse(mockStore.get(QUEUE_KEY) ?? "[]");

const sentEvents = (call = 0) =>
  (
    mockTrack.mock.calls[call]?.[0] as {
      events: Record<string, unknown>[];
    }
  ).events;

beforeEach(() => {
  mockStore.clear();
  mockTrack.mockReset();
  mockTrack.mockResolvedValue({ inserted: 1, failed: 0, dropped: 0 });
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-19T12:00:00Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("newsAnalyticsClient delivery", () => {
  it("sends only the fields the server knows and clears what was delivered", async () => {
    const client = load();
    client.enqueue(makeEvent("a1", "user-1"));

    await client.flush();

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack.mock.calls[0]?.[0].userId).toBe("user-1");
    expect(Object.keys(sentEvents()[0] ?? {}).sort()).toEqual(
      [
        "articleId",
        "deviceId",
        "event",
        "metadata",
        "platform",
        "sessionId",
        "timestamp",
      ].sort()
    );
    expect(queued()).toEqual([]);
  });

  it("credits each event to the user who was signed in when it happened", async () => {
    const client = load();
    client.enqueue(makeEvent("a1", "user-1"));
    client.enqueue(makeEvent("a2", "user-2"));
    client.enqueue(makeEvent("a3"));

    // Whoever is signed in at flush time only covers events with no owner.
    await client.flush("user-3");

    const byUser = Object.fromEntries(
      mockTrack.mock.calls.map(([arg]) => [
        arg.userId,
        arg.events.map((e: { articleId: string }) => e.articleId),
      ])
    );
    expect(byUser).toEqual({
      "user-1": ["a1"],
      "user-2": ["a2"],
      "user-3": ["a3"],
    });
  });

  it("keeps a batch the server could not reach, without counting it against the events", async () => {
    mockTrack.mockRejectedValue(new TypeError("Network request failed"));
    const client = load();
    client.enqueue(makeEvent("a1", "user-1"));

    await client.flush();

    expect(queued()).toHaveLength(1);
    expect(queued()[0]?.failures).toBeUndefined();
  });

  it("keeps a batch the server asked us to slow down on", async () => {
    mockTrack.mockRejectedValue(new ORPCError("TOO_MANY_REQUESTS"));
    const client = load();
    client.enqueue(makeEvent("a1", "user-1"));

    await client.flush();

    expect(queued()).toHaveLength(1);
    expect(queued()[0]?.failures).toBeUndefined();
  });

  it("drops a batch the server refuses outright, so it cannot block the queue", async () => {
    mockTrack.mockRejectedValueOnce(new ORPCError("BAD_REQUEST"));
    const client = load();
    client.enqueue(makeEvent("bad", "user-1"));
    await client.flush();
    expect(queued()).toEqual([]);

    client.enqueue(makeEvent("good", "user-1"));
    await client.flush();

    expect(sentEvents(1).map((e) => e.articleId)).toEqual(["good"]);
    expect(queued()).toEqual([]);
  });

  it("retries a database failure a few times and then gives up", async () => {
    // The server answers 200 but reports the insert failed.
    mockTrack.mockResolvedValue({ inserted: 0, failed: 1, dropped: 0 });
    const client = load();
    client.enqueue(makeEvent("a1", "user-1"));

    await client.flush();
    expect(queued()[0]?.failures).toBe(1);

    for (let attempt = 0; attempt < 3; attempt++) {
      await client.flush();
    }
    expect(queued()[0]?.failures).toBe(4);

    await client.flush();
    expect(queued()).toEqual([]);
    expect(mockTrack).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["a 5xx", new ORPCError("INTERNAL_SERVER_ERROR")],
    [
      "a reply that is not valid oRPC (proxy page, missing route)",
      new ORPCError("MALFORMED_ORPC_RESPONSE"),
    ],
    ["an error nobody recognises", new Error("boom")],
  ])("retries a bounded number of times after %s", async (_label, error) => {
    mockTrack.mockRejectedValue(error);
    const client = load();
    client.enqueue(makeEvent("a1", "user-1"));

    await client.flush();

    expect(queued()[0]?.failures).toBe(1);
  });

  it("counts a 5xx the same way as a reported database failure", async () => {
    mockTrack.mockRejectedValue(new ORPCError("SERVICE_UNAVAILABLE"));
    const client = load();
    client.enqueue(makeEvent("a1", "user-1"));

    await client.flush();

    expect(queued()[0]?.failures).toBe(1);
  });

  it("puts retried events ahead of ones queued while the request was out", async () => {
    let release!: () => void;
    mockTrack.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          release = () => reject(new TypeError("Network request failed"));
        })
    );
    const client = load();
    client.enqueue(makeEvent("first", "user-1"));

    const flushing = client.flush();
    client.enqueue(makeEvent("second", "user-1"));
    release();
    await flushing;

    expect(queued().map((e) => e.articleId)).toEqual(["first", "second"]);
  });

  it("caps the offline queue, dropping the oldest events", () => {
    const client = load();
    for (let i = 0; i < 1005; i++) {
      client.enqueue(makeEvent(`a${i}`, "user-1"));
    }

    const queue = queued();
    expect(queue).toHaveLength(1000);
    expect(queue[0]?.articleId).toBe("a5");
    expect(queue.at(-1)?.articleId).toBe("a1004");
  });

  it("still delivers events queued by an older build, which carry no userId", async () => {
    mockStore.set(
      QUEUE_KEY,
      JSON.stringify([
        {
          articleId: "old",
          event: "view",
          sessionId: "s",
          deviceId: "d",
          platform: "ios",
          timestamp: "2026-09-18T00:00:00Z",
        },
      ])
    );
    const client = load();

    await client.flush("user-9");

    expect(mockTrack.mock.calls[0]?.[0].userId).toBe("user-9");
    expect(sentEvents()[0]?.articleId).toBe("old");
  });
});

describe("newsAnalyticsClient sessions", () => {
  const sessionOf = (index: number) => queued()[index]?.sessionId;

  it("keeps one session while the reader stays active", () => {
    const client = load();
    client.enqueue(makeEvent("a1"));
    jest.setSystemTime(Date.now() + 29 * MINUTE);
    client.enqueue(makeEvent("a2"));

    expect(sessionOf(0)).toBe(sessionOf(1));
  });

  it("starts a new session after 30 minutes without activity", () => {
    const client = load();
    client.enqueue(makeEvent("a1"));
    jest.setSystemTime(Date.now() + 31 * MINUTE);
    client.enqueue(makeEvent("a2"));

    expect(sessionOf(0)).not.toBe(sessionOf(1));
  });

  it("measures the gap from the last event, not from launch", () => {
    const client = load();
    client.enqueue(makeEvent("a1"));
    jest.setSystemTime(Date.now() + 20 * MINUTE);
    client.enqueue(makeEvent("a2"));
    jest.setSystemTime(Date.now() + 20 * MINUTE);
    client.enqueue(makeEvent("a3"));

    expect(sessionOf(0)).toBe(sessionOf(2));
  });
});
