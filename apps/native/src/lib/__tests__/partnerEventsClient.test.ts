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
    partnerContentEvents: {
      track: (...args: unknown[]) => mockTrack(...args),
    },
  },
}));

class ORPCError extends Error {
  readonly code: string;
  constructor(code: string, message = code) {
    super(message);
    this.name = "ORPCError";
    this.code = code;
  }
}

type Client = typeof import("../partnerEventsClient")["partnerEventsClient"];

const QUEUE_KEY = "partner_events_queue";
const MINUTE = 60 * 1000;
const ID = "11111111-2222-3333-4444-555555555555";

const load = (): Client => {
  let client!: Client;
  jest.isolateModules(() => {
    client = require("../partnerEventsClient").partnerEventsClient;
  });
  return client;
};

const makeEvent = (contentId = ID, extra: Record<string, unknown> = {}) => ({
  contentId,
  event: "impression" as const,
  surface: "homepage-ads-banner" as const,
  ...extra,
});

const queued = (): Record<string, unknown>[] =>
  JSON.parse(mockStore.get(QUEUE_KEY) ?? "[]");

const sentEvents = (call = 0) =>
  (mockTrack.mock.calls[call]?.[0] as { events: Record<string, unknown>[] })
    .events;

/** A copy of the server's input constraints (partnerContentEvents.ts). */
const satisfiesServerSchema = (e: Record<string, unknown>): boolean => {
  const str = (v: unknown, min: number, max: number) =>
    typeof v === "string" && v.length >= min && v.length <= max;
  const allowed = [
    "contentId",
    "event",
    "surface",
    "position",
    "sessionId",
    "deviceId",
    "eventId",
    "platform",
    "timestamp",
  ];
  return (
    Object.keys(e).every((k) => allowed.includes(k)) &&
    str(e.contentId, 0, 64) &&
    (e.event === "impression" || e.event === "click") &&
    str(e.surface, 1, 100) &&
    (e.position === undefined ||
      (typeof e.position === "number" &&
        Number.isFinite(e.position) &&
        e.position >= 0 &&
        e.position <= 10_000)) &&
    str(e.sessionId, 1, 200) &&
    str(e.deviceId, 1, 200) &&
    str(e.eventId, 8, 64) &&
    ["android", "ios", "web", undefined].includes(e.platform as string) &&
    str(e.timestamp, 0, 64)
  );
};

beforeEach(() => {
  mockStore.clear();
  mockTrack.mockReset();
  mockTrack.mockResolvedValue({
    inserted: 1,
    duplicates: 0,
    failed: 0,
    dropped: 0,
  });
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-21T12:00:00Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("partnerEventsClient delivery", () => {
  it("persists on enqueue and sends a wire event without failures", async () => {
    const client = load();
    client.enqueue(makeEvent(ID, { position: 3 }));
    expect(queued()).toHaveLength(1);

    await client.flush();

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(Object.keys(sentEvents()[0] ?? {}).sort()).toEqual(
      [
        "contentId",
        "deviceId",
        "event",
        "eventId",
        "platform",
        "position",
        "sessionId",
        "surface",
        "timestamp",
      ].sort()
    );
    expect(sentEvents()[0]).not.toHaveProperty("failures");
    expect(queued()).toEqual([]);
  });

  it("sends events that pass the server's constraints", async () => {
    const client = load();
    client.enqueue(makeEvent());
    await client.flush();
    for (const e of sentEvents()) {
      expect(satisfiesServerSchema(e)).toBe(true);
    }
  });

  it("omits a position that is out of range or not finite", async () => {
    const client = load();
    client.enqueue(makeEvent(ID, { position: 10_001 }));
    client.enqueue(makeEvent(ID, { position: -1 }));
    client.enqueue(makeEvent(ID, { position: Number.NaN }));
    client.enqueue(makeEvent(ID, { position: Number.POSITIVE_INFINITY }));
    await client.flush();

    expect(sentEvents()).toHaveLength(4);
    for (const e of sentEvents()) {
      expect(e.position).toBeUndefined();
      expect(satisfiesServerSchema(e)).toBe(true);
    }
  });

  it("never queues an event with an empty or oversized id", async () => {
    const client = load();
    client.enqueue(makeEvent(""));
    client.enqueue(makeEvent("x".repeat(65)));
    expect(queued()).toEqual([]);
    await client.flush();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("drops stored events the server would reject instead of sending them", async () => {
    mockStore.set(
      QUEUE_KEY,
      JSON.stringify([
        {
          contentId: ID,
          event: "click",
          surface: "news-post",
          sessionId: "",
          deviceId: "d",
          eventId: "abcdefgh",
          platform: "ios",
          timestamp: "2026-10-21T00:00:00Z",
        },
      ])
    );
    const client = load();
    await client.flush();
    expect(mockTrack).not.toHaveBeenCalled();
    expect(queued()).toEqual([]);
  });

  it("keeps a batch it could not deliver, with the same eventId", async () => {
    mockTrack.mockRejectedValueOnce(new TypeError("Network request failed"));
    const client = load();
    client.enqueue(makeEvent());
    const mintedAs = queued()[0]?.eventId;

    await client.flush();
    expect(queued()).toHaveLength(1);
    expect(queued()[0]?.failures).toBeUndefined();
    await client.flush();

    expect(sentEvents(0)[0]?.eventId).toBe(mintedAs);
    expect(sentEvents(1)[0]?.eventId).toBe(mintedAs);
    expect(queued()).toEqual([]);
  });

  it("counts a server failure and drops the event after 5", async () => {
    mockTrack.mockResolvedValue({
      inserted: 0,
      duplicates: 0,
      failed: 1,
      dropped: 0,
    });
    const client = load();
    client.enqueue(makeEvent());

    await client.flush();
    expect(queued()[0]?.failures).toBe(1);
    for (let i = 0; i < 3; i++) {
      await client.flush();
    }
    expect(queued()[0]?.failures).toBe(4);
    await client.flush();

    expect(queued()).toEqual([]);
    expect(mockTrack).toHaveBeenCalledTimes(5);
  });

  it("drops a batch the server refuses outright", async () => {
    mockTrack.mockRejectedValueOnce(new ORPCError("BAD_REQUEST"));
    const client = load();
    client.enqueue(makeEvent("bad"));
    await client.flush();
    expect(queued()).toEqual([]);

    client.enqueue(makeEvent(ID));
    await client.flush();
    expect(sentEvents(1)[0]?.contentId).toBe(ID);
    expect(queued()).toEqual([]);
  });

  it("caps the queue at 1,000, dropping the oldest", () => {
    const client = load();
    for (let i = 0; i < 1005; i++) {
      client.enqueue(makeEvent(`c${i}`));
    }
    const queue = queued();
    expect(queue).toHaveLength(1000);
    expect(queue[0]?.contentId).toBe("c5");
    expect(queue.at(-1)?.contentId).toBe("c1004");
  });

  it("sends at most 50 events per flush", async () => {
    const client = load();
    for (let i = 0; i < 60; i++) {
      client.enqueue(makeEvent(`c${i}`));
    }
    await client.flush();
    expect(sentEvents()).toHaveLength(50);
    expect(queued()).toHaveLength(10);
  });
});

describe("partnerEventsClient sessions", () => {
  const sessionOf = (index: number) => queued()[index]?.sessionId;

  it("keeps one session while active", () => {
    const client = load();
    client.enqueue(makeEvent("a"));
    jest.setSystemTime(Date.now() + 29 * MINUTE);
    client.enqueue(makeEvent("b"));
    expect(sessionOf(0)).toBe(sessionOf(1));
  });

  it("rolls the session after 30 minutes idle", () => {
    const client = load();
    client.enqueue(makeEvent("a"));
    jest.setSystemTime(Date.now() + 31 * MINUTE);
    client.enqueue(makeEvent("b"));
    expect(sessionOf(0)).not.toBe(sessionOf(1));
  });

  it("reports the current session id, applying the idle rule", () => {
    const client = load();
    const first = client.currentSessionId();
    expect(client.currentSessionId()).toBe(first);
    jest.setSystemTime(Date.now() + 31 * MINUTE);
    expect(client.currentSessionId()).not.toBe(first);
  });
});
