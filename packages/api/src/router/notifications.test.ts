import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import { createFakePayload, expectError, mockContext } from "../test-utils";
import { notificationsRouter } from "./notifications";

// testNotification and newsCreate were public procedures that let any caller
// push to any user, or to every BREAKING_NEWS subscriber. Nothing called them;
// they are removed. Keep them out. `inbox` only reads the caller's own rows and
// is protected (its tests below assert the unauthenticated rejection).
describe("notificationsRouter surface", () => {
  it("exposes no unauthenticated send procedures", () => {
    expect(Object.keys(notificationsRouter).sort()).toEqual([
      "inbox",
      "trackOpen",
    ]);
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

// ─── inbox ────────────────────────────────────────────────────────────────────

const authedUser = { id: "user-1", isAnonymous: false };

function inboxItem(
  id: string,
  type: string,
  createdAt: string,
  user = "user-1"
) {
  return {
    id,
    user,
    type,
    title: `Title ${id}`,
    body: `Body ${id}`,
    createdAt,
  };
}

const seedInbox = () =>
  createFakePayload({
    collections: {
      "notification-inbox": [
        inboxItem("n1", "news", "2024-01-01T00:00:00.000Z"),
        inboxItem("n2", "breaking_news", "2024-01-03T00:00:00.000Z"),
        inboxItem("n3", "news", "2024-01-04T00:00:00.000Z", "user-2"),
        inboxItem("n4", "comment", "2024-01-02T00:00:00.000Z"),
        inboxItem("n5", "misc", "2024-01-05T00:00:00.000Z"),
      ],
    },
  });

const inboxContext = (payload: ReturnType<typeof createFakePayload>) =>
  mockContext({ user: authedUser as never, payload });

describe("notificationsRouter.inbox.list", () => {
  it("returns only the caller's rows, newest first", async () => {
    const payload = seedInbox();

    const result = await call(
      notificationsRouter.inbox.list,
      {},
      { context: inboxContext(payload) }
    );

    expect(result.docs.map((doc) => doc.id)).toEqual(["n5", "n2", "n4", "n1"]);
  });

  it("filters news to news and breaking_news", async () => {
    const payload = seedInbox();

    const result = await call(
      notificationsRouter.inbox.list,
      { filter: "news" },
      { context: inboxContext(payload) }
    );

    expect(result.docs.map((doc) => doc.id).sort()).toEqual(["n1", "n2"]);
  });

  it("filters replies to comments", async () => {
    const payload = seedInbox();

    const result = await call(
      notificationsRouter.inbox.list,
      { filter: "replies" },
      { context: inboxContext(payload) }
    );

    expect(result.docs.map((doc) => doc.id)).toEqual(["n4"]);
  });

  it("all applies no type filter", async () => {
    const payload = seedInbox();

    const result = await call(
      notificationsRouter.inbox.list,
      { filter: "all" },
      { context: inboxContext(payload) }
    );

    expect(result.docs).toHaveLength(4);
  });

  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(notificationsRouter.inbox.list, {}, { context: mockContext() })
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });
});

describe("notificationsRouter.inbox.unreadCount", () => {
  it("counts every row for the caller when since is omitted", async () => {
    const payload = seedInbox();

    const result = await call(
      notificationsRouter.inbox.unreadCount,
      {},
      { context: inboxContext(payload) }
    );

    expect(result).toBe(4);
  });

  it("counts only rows newer than since", async () => {
    const payload = seedInbox();

    const result = await call(
      notificationsRouter.inbox.unreadCount,
      { since: "2024-01-02T12:00:00.000Z" },
      { context: inboxContext(payload) }
    );

    expect(result).toBe(2);
  });

  it("caps the count at 99", async () => {
    const payload = createFakePayload({
      collections: {
        "notification-inbox": Array.from({ length: 105 }, (_, index) =>
          inboxItem(
            `n${index}`,
            "misc",
            `2024-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`
          )
        ),
      },
    });

    const result = await call(
      notificationsRouter.inbox.unreadCount,
      {},
      { context: inboxContext(payload) }
    );

    expect(result).toBe(99);
  });
});

describe("notificationsRouter.inbox.markOpened", () => {
  it("increments clickCount on the caller's row", async () => {
    const payload = createFakePayload({
      collections: {
        "notification-inbox": [
          { id: "n1", user: "user-1", clickCount: 2 },
          { id: "n2", user: "user-2", clickCount: 5 },
        ],
      },
    });

    const result = await call(
      notificationsRouter.inbox.markOpened,
      { id: "n1" },
      { context: inboxContext(payload) }
    );

    expect(result).toEqual({ success: true });
    expect(payload.docs("notification-inbox")[0]?.clickCount).toBe(3);
  });

  it("does not touch another user's row", async () => {
    const payload = createFakePayload({
      collections: {
        "notification-inbox": [
          { id: "n1", user: "user-1", clickCount: 2 },
          { id: "n2", user: "user-2", clickCount: 5 },
        ],
      },
    });

    const error = await expectError(
      call(
        notificationsRouter.inbox.markOpened,
        { id: "n2" },
        { context: inboxContext(payload) }
      )
    );

    expect(error.code).toBe("NOT_FOUND");
    expect(payload.docs("notification-inbox")[1]?.clickCount).toBe(5);
  });

  it("throws NOT_FOUND for an unknown row", async () => {
    const payload = createFakePayload({
      collections: { "notification-inbox": [] },
    });

    const error = await expectError(
      call(
        notificationsRouter.inbox.markOpened,
        { id: "missing" },
        { context: inboxContext(payload) }
      )
    );

    expect(error.code).toBe("NOT_FOUND");
  });
});
