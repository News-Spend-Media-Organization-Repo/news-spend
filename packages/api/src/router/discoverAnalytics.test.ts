import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import { createFakePayload, mockContext, stubDrizzle } from "../test-utils";
import { discoverAnalyticsRouter } from "./discoverAnalytics";

const event = {
  event: "view" as const,
  sessionId: "sess-1",
  deviceId: "device-1",
  eventId: "evt-12345678",
};

describe("discoverAnalyticsRouter.track", () => {
  it("stores a batch with one statement", async () => {
    const payload = createFakePayload({ collections: {} });
    const drizzle = stubDrizzle(payload, [{ id: "1" }, { id: "2" }]);
    const ctx = mockContext({ payload });

    const result = await call(
      discoverAnalyticsRouter.track,
      {
        events: [
          event,
          {
            ...event,
            event: "open",
            itemType: "game",
            itemId: "prism-match-3d",
            eventId: "evt-87654321",
          },
        ],
      },
      { context: ctx }
    );

    expect(result).toEqual({
      inserted: 2,
      duplicates: 0,
      failed: 0,
      dropped: 0,
    });
    expect(drizzle.queries).toHaveLength(1);
    expect(drizzle.queries[0]?.sql).toContain("discover_events");
  });

  it("counts an event the device already sent as a duplicate", async () => {
    const payload = createFakePayload({ collections: {} });
    stubDrizzle(payload, []);
    const ctx = mockContext({ payload });

    const result = await call(
      discoverAnalyticsRouter.track,
      { events: [event] },
      { context: ctx }
    );

    expect(result.inserted).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("credits the signed-in caller, not anyone named in the body", async () => {
    const payload = createFakePayload({ collections: {} });
    const drizzle = stubDrizzle(payload, [{ id: "1" }]);
    const ctx = mockContext({
      payload,
      user: { id: "user-1", isAnonymous: false } as never,
    });

    await call(
      discoverAnalyticsRouter.track,
      { events: [{ ...event, userId: "someone-else" } as never] },
      { context: ctx }
    );

    // The stub records the statement with its bound values serialised in.
    const statement = drizzle.queries[0]?.sql ?? "";
    expect(statement).toContain("user-1");
    expect(statement).not.toContain("someone-else");
  });

  it("rejects an unknown event name", async () => {
    const payload = createFakePayload({ collections: {} });
    const ctx = mockContext({ payload });
    await expect(
      call(
        discoverAnalyticsRouter.track,
        { events: [{ ...event, event: "nonsense" } as never] },
        { context: ctx }
      )
    ).rejects.toBeDefined();
  });
});
