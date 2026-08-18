import { afterEach, describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";

import { createFakePayload, mockContext } from "../test-utils";
import { notificationsRouter } from "./notifications";

// Mock sendNotification from the payload package so we never hit the real
// notification infrastructure.  Each test can inspect mockSendNotification.calls.
const mockSendNotification = mock(async () => ({ success: true }));
mock.module("@news-spend-media/payload/lib/lottery-notification", () => ({
  sendNotification: mockSendNotification,
}));

afterEach(() => {
  mockSendNotification.mockClear();
});

// ─── testNotification ─────────────────────────────────────────────────────────

describe("notificationsRouter.testNotification", () => {
  it("returns success:false when the user has no push tokens", async () => {
    const payload = createFakePayload({
      collections: { "push-tokens": [] },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.testNotification,
      { userId: "user-1" },
      { context: ctx }
    );

    expect(result).toEqual({
      success: false,
      message: "No push tokens found for user",
    });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("sends a notification with default title and body when omitted", async () => {
    const payload = createFakePayload({
      collections: {
        "push-tokens": [{ id: "tok-1", userId: "user-1", token: "expo-abc" }],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.testNotification,
      { userId: "user-1" },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });
    expect(mockSendNotification).toHaveBeenCalledWith({
      pushTokens: [expect.objectContaining({ id: "tok-1" })],
      title: "Test Notification",
      body: "This is a test notification",
      data: {},
    });
  });

  it("passes through custom title, body, and data", async () => {
    const payload = createFakePayload({
      collections: {
        "push-tokens": [{ id: "tok-1", userId: "user-1", token: "expo-abc" }],
      },
    });
    const ctx = mockContext({ payload });
    const customData = { screen: "profile" };

    const result = await call(
      notificationsRouter.testNotification,
      {
        userId: "user-1",
        title: "Custom Title",
        body: "Custom body",
        data: customData,
      },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });
    expect(mockSendNotification).toHaveBeenCalledWith({
      pushTokens: [expect.objectContaining({ id: "tok-1" })],
      title: "Custom Title",
      body: "Custom body",
      data: customData,
    });
  });

  it("queries push-tokens by userId", async () => {
    const payload = createFakePayload({
      collections: {
        "push-tokens": [
          { id: "tok-1", userId: "user-1", token: "expo-abc" },
          { id: "tok-2", userId: "user-2", token: "expo-def" },
        ],
      },
    });
    const ctx = mockContext({ payload });

    await call(
      notificationsRouter.testNotification,
      { userId: "user-1" },
      { context: ctx }
    );

    const findCall = payload.calls.find(
      (c) => c.op === "find" && c.collection === "push-tokens"
    );
    expect(findCall).toBeDefined();
    expect(findCall?.args.where).toEqual({
      userId: { equals: "user-1" },
    });
    // Only user-1's token should be passed to sendNotification
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        pushTokens: [expect.objectContaining({ id: "tok-1" })],
      })
    );
  });
});

// ─── newsCreate ───────────────────────────────────────────────────────────────

describe("notificationsRouter.newsCreate", () => {
  it("queries users with BREAKING_NEWS preference and their push tokens", async () => {
    const payload = createFakePayload({
      collections: {
        users: [
          {
            id: "u1",
            notificationPreferences: { types: { BREAKING_NEWS: true } },
          },
          {
            id: "u2",
            notificationPreferences: { types: { BREAKING_NEWS: false } },
          },
          {
            id: "u3",
            notificationPreferences: { types: { BREAKING_NEWS: true } },
          },
        ],
        "push-tokens": [
          { id: "tok-1", user: "u1", token: "expo-1" },
          { id: "tok-2", user: "u3", token: "expo-2" },
          { id: "tok-3", user: "u2", token: "expo-3" },
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.newsCreate,
      { title: "Breaking!", body: "Something happened" },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });

    // Verify the users query targets BREAKING_NEWS subscribers
    const userFind = payload.calls.find(
      (c) => c.op === "find" && c.collection === "users"
    );
    expect(userFind).toBeDefined();
    expect(userFind?.args.where).toEqual({
      "notificationPreferences.types.BREAKING_NEWS": { equals: true },
    });

    // Only the two subscribed users' tokens are sent — u2 opted out, so
    // tok-3 must not appear.
    const tokenFind = payload.calls.find(
      (c) => c.op === "find" && c.collection === "push-tokens"
    );
    expect(tokenFind?.args.where).toEqual({ user: { in: ["u1", "u3"] } });
    expect(mockSendNotification).toHaveBeenCalledWith({
      pushTokens: [
        { id: "tok-1", user: "u1", token: "expo-1" },
        { id: "tok-2", user: "u3", token: "expo-2" },
      ],
      title: "Breaking!",
      body: "Something happened",
      data: {},
    });
  });

  it("sends with empty tokens when no matching users exist", async () => {
    const payload = createFakePayload({
      collections: {
        users: [
          {
            id: "u1",
            notificationPreferences: { types: { BREAKING_NEWS: false } },
          },
        ],
        "push-tokens": [{ id: "tok-1", user: "u1", token: "expo-1" }],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.newsCreate,
      { title: "News", body: "Body" },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });
    // sendNotification is still called — push-tokens query uses empty `in` list
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        pushTokens: [],
        title: "News",
        body: "Body",
      })
    );
  });

  it("passes through optional data", async () => {
    const payload = createFakePayload({
      collections: { users: [], "push-tokens": [] },
    });
    const ctx = mockContext({ payload });

    await call(
      notificationsRouter.newsCreate,
      { title: "T", body: "B", data: { articleId: "a1" } },
      { context: ctx }
    );

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ data: { articleId: "a1" } })
    );
  });
});

// ─── sendLotteryNotification ──────────────────────────────────────────────────

describe("notificationsRouter.sendLotteryNotification", () => {
  it("sends lottery end notification to all participants", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-tickets": [
          { id: "t1", lottery: "lottery-1", user: "u1" },
          { id: "t2", lottery: "lottery-1", user: "u2" },
          { id: "t3", lottery: "lottery-2", user: "u3" },
        ],
        "push-tokens": [
          { id: "tok-1", user: "u1", token: "expo-1" },
          { id: "tok-2", user: "u2", token: "expo-2" },
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.sendLotteryNotification,
      { lotteryId: "lottery-1" },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });

    // Verify lottery-tickets query
    const ticketFind = payload.calls.find(
      (c) => c.op === "find" && c.collection === "lottery-tickets"
    );
    expect(ticketFind).toBeDefined();
    expect(ticketFind?.args.where).toEqual({
      lottery: { equals: "lottery-1" },
    });

    // Verify push-tokens query with participant user ids
    const tokenFind = payload.calls.find(
      (c) => c.op === "find" && c.collection === "push-tokens"
    );
    expect(tokenFind).toBeDefined();
    expect(tokenFind?.args.where.user.in).toEqual(
      expect.arrayContaining(["u1", "u2"])
    );

    expect(mockSendNotification).toHaveBeenCalledWith({
      pushTokens: expect.arrayContaining([
        expect.objectContaining({ id: "tok-1" }),
        expect.objectContaining({ id: "tok-2" }),
      ]),
      title: "Giveaway has ended",
      body: "Check to see if you won",
      data: { lotteryId: "lottery-1", type: "lottery", url: "discover" },
    });
  });

  it("handles object-style user references on lottery tickets", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-tickets": [
          { id: "t1", lottery: "lottery-1", user: { id: "u1" } },
        ],
        "push-tokens": [{ id: "tok-1", user: "u1", token: "expo-1" }],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.sendLotteryNotification,
      { lotteryId: "lottery-1" },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        pushTokens: [expect.objectContaining({ id: "tok-1" })],
      })
    );
  });

  it("sends with empty tokens when there are no participants", async () => {
    const payload = createFakePayload({
      collections: {
        "lottery-tickets": [],
        "push-tokens": [],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      notificationsRouter.sendLotteryNotification,
      { lotteryId: "lottery-99" },
      { context: ctx }
    );

    expect(result).toEqual({ success: true });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        pushTokens: [],
        title: "Giveaway has ended",
      })
    );
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
