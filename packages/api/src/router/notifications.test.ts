import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import { createFakePayload, mockContext } from "../test-utils";
import { notificationsRouter } from "./notifications";

// testNotification and newsCreate were public procedures that let any caller
// push to any user, or to every BREAKING_NEWS subscriber. Nothing called them;
// they are removed. Keep them out.
describe("notificationsRouter surface", () => {
  it("exposes no unauthenticated send procedures", () => {
    expect(Object.keys(notificationsRouter)).toEqual(["trackOpen"]);
  });
});

// ─── trackOpen ────────────────────────────────────────────────────────────────

describe("notificationsRouter.trackOpen", () => {
  it("updates the delivery when both notificationId and deviceToken are present", async () => {
    const payload = createFakePayload({
      collections: {
        "notification-deliveries": [
          {
            id: "del-1",
            notification: "notif-1",
            deviceToken: "expo-abc",
            status: "delivered",
          },
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.trackOpen,
      {
        data: { notificationId: "notif-1", deviceToken: "expo-abc" },
      },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });

    // Should have queried for the delivery
    const findCall = payload.calls.find(
      (c) => c.op === "find" && c.collection === "notification-deliveries"
    );
    expect(findCall).toBeDefined();
    expect(findCall?.args.where).toEqual({
      and: [
        { notification: { equals: "notif-1" } },
        { deviceToken: { equals: "expo-abc" } },
      ],
    });
    expect(findCall?.args.limit).toBe(1);

    // Should have updated the delivery
    const updateCall = payload.calls.find(
      (c) => c.op === "update" && c.collection === "notification-deliveries"
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.args.id).toBe("del-1");
    expect(updateCall?.args.data).toMatchObject({ status: "opened" });
    expect(updateCall?.args.data.openedAt).toBeDefined();
  });

  it("does not query deliveries when notificationId is missing", async () => {
    const payload = createFakePayload({
      collections: {
        "notification-deliveries": [
          { id: "del-1", notification: "notif-1", deviceToken: "expo-abc" },
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.trackOpen,
      { data: { deviceToken: "expo-abc" } },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });
    expect(
      payload.calls.filter((c) => c.collection === "notification-deliveries")
    ).toHaveLength(0);
  });

  it("does not query deliveries when deviceToken is missing", async () => {
    const payload = createFakePayload({
      collections: {
        "notification-deliveries": [
          { id: "del-1", notification: "notif-1", deviceToken: "expo-abc" },
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.trackOpen,
      { data: { notificationId: "notif-1" } },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });
    expect(
      payload.calls.filter((c) => c.collection === "notification-deliveries")
    ).toHaveLength(0);
  });

  it("does not update when the delivery is not found", async () => {
    const payload = createFakePayload({
      collections: { "notification-deliveries": [] },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.trackOpen,
      {
        data: { notificationId: "notif-missing", deviceToken: "expo-xyz" },
      },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });
    // find ran but update did not
    expect(
      payload.calls.filter(
        (c) => c.op === "update" && c.collection === "notification-deliveries"
      )
    ).toHaveLength(0);
  });

  it("does not query deliveries when data is omitted entirely", async () => {
    const payload = createFakePayload({
      collections: { "notification-deliveries": [] },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.trackOpen,
      {},
      { context: ctx }
    );

    expect(result).toEqual({ success: true });
    expect(
      payload.calls.filter((c) => c.collection === "notification-deliveries")
    ).toHaveLength(0);
  });

  it("always returns success:true regardless of delivery state", async () => {
    const payload = createFakePayload({
      collections: { "notification-deliveries": [] },
    });
    const ctx = mockContext({ payload });

    // No data at all
    expect(
      await call(notificationsRouter.trackOpen, {}, { context: ctx })
    ).toEqual({ success: true });

    // With data but missing notificationId
    expect(
      await call(
        notificationsRouter.trackOpen,
        { data: { deviceToken: "tok" } },
        { context: ctx }
      )
    ).toEqual({ success: true });

    // With both ids but no matching delivery
    expect(
      await call(
        notificationsRouter.trackOpen,
        { data: { notificationId: "x", deviceToken: "y" } },
        { context: ctx }
      )
    ).toEqual({ success: true });
  });
});
