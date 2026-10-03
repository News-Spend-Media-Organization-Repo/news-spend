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
    discoverAnalytics: {
      track: (...args: unknown[]) => mockTrack(...args),
    },
  },
}));

class ORPCError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ORPCError";
    this.code = code;
  }
}

type Mod = typeof import("../discoverAnalyticsClient");

const QUEUE_KEY = "discover_analytics_queue";

const load = (): Mod => {
  let mod!: Mod;
  jest.isolateModules(() => {
    mod = require("../discoverAnalyticsClient");
  });
  return mod;
};

const queued = (): Record<string, unknown>[] =>
  JSON.parse(mockStore.get(QUEUE_KEY) ?? "[]");

beforeEach(() => {
  mockStore.clear();
  mockTrack.mockReset();
  mockTrack.mockResolvedValue({
    inserted: 1,
    duplicates: 0,
    failed: 0,
    dropped: 0,
  });
});

describe("discoverAnalyticsClient", () => {
  it("keeps an event on the device with an id, a session and a time", () => {
    const { discoverAnalyticsClient } = load();
    discoverAnalyticsClient.track({
      event: "open",
      itemType: "game",
      itemId: "prism-match-3d",
    });

    const [event] = queued();
    expect(event).toMatchObject({
      event: "open",
      itemType: "game",
      itemId: "prism-match-3d",
    });
    expect(event?.eventId).toEqual(expect.any(String));
    expect(event?.sessionId).toEqual(expect.any(String));
    expect(event?.deviceId).toEqual(expect.any(String));
    expect(event?.timestamp).toEqual(expect.any(String));
  });

  it("sends the queue and clears it on success, without the failure count", async () => {
    const { discoverAnalyticsClient } = load();
    discoverAnalyticsClient.track({ event: "view" });
    await discoverAnalyticsClient.flush();

    expect(mockTrack).toHaveBeenCalledTimes(1);
    const sent = (
      mockTrack.mock.calls[0]?.[0] as { events: Record<string, unknown>[] }
    ).events;
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toHaveProperty("failures");
    expect(queued()).toHaveLength(0);
  });

  it("keeps events when the network is down, with the same id for the retry", async () => {
    const { discoverAnalyticsClient } = load();
    discoverAnalyticsClient.track({ event: "view" });
    const firstId = queued()[0]?.eventId;

    mockTrack.mockRejectedValueOnce(new TypeError("Network request failed"));
    await discoverAnalyticsClient.flush();

    expect(queued()).toHaveLength(1);
    expect(queued()[0]?.eventId).toBe(firstId);
  });

  it("drops events the server refuses outright", async () => {
    const { discoverAnalyticsClient } = load();
    discoverAnalyticsClient.track({ event: "view" });

    mockTrack.mockRejectedValueOnce(new ORPCError("BAD_REQUEST"));
    await discoverAnalyticsClient.flush();

    expect(queued()).toHaveLength(0);
  });

  it("gives up on events the server keeps failing to store", async () => {
    const { discoverAnalyticsClient } = load();
    discoverAnalyticsClient.track({ event: "view" });
    mockTrack.mockResolvedValue({
      inserted: 0,
      duplicates: 0,
      failed: 1,
      dropped: 0,
    });

    for (let i = 0; i < 6; i++) {
      await discoverAnalyticsClient.flush();
    }
    expect(queued()).toHaveLength(0);
  });

  it("trackDiscover never throws", () => {
    const { trackDiscover } = load();
    expect(() => trackDiscover({ event: "view" })).not.toThrow();
  });
});
