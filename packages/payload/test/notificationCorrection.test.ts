import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ExpoPushMessage } from "expo-server-sdk";

const notification = {
  id: "n-1",
  title: "{{firstName}}, a correction",
  body: "This is the fixed copy.",
  sentAt: "2026-11-04T18:00:00.000Z",
  sound: true,
  priority: "default",
  type: "misc",
  data: { url: "/discover" },
};

const deliveries = [
  {
    id: "d-1",
    user: "u-1",
    pushToken: "ExponentPushToken[one]",
    deviceToken: "t-1",
  },
  {
    id: "d-2",
    user: "u-2",
    pushToken: "ExponentPushToken[two]",
    deviceToken: "t-2",
  },
];

const nameById: Record<string, string> = {
  "u-1": "Ada Obi",
  "u-2": "Bola Eze",
};

const update = mock(async () => ({}));
const queue = mock(async () => ({}));
const sendPushNotificationsAsync = mock(async (messages: ExpoPushMessage[]) =>
  messages.map((_, i) => ({ status: "ok", id: `ticket-${i}` }))
);

const payload = {
  findByID: mock(async () => notification),
  find: mock(({ collection }: { collection: string }) => {
    if (collection === "notification-deliveries") {
      return { docs: deliveries };
    }
    if (collection === "users") {
      return {
        docs: Object.entries(nameById).map(([id, name]) => ({ id, name })),
      };
    }
    return { docs: [] };
  }),
  update,
  delete: mock(async () => ({})),
  jobs: { queue },
  logger: { error: mock(() => undefined) },
};

mock.module("../src/lib/getPayload", () => ({
  getPayload: async () => payload,
}));

mock.module("expo-server-sdk", () => ({
  Expo: class {
    chunkPushNotifications(messages: ExpoPushMessage[]) {
      return [messages];
    }
    sendPushNotificationsAsync(messages: ExpoPushMessage[]) {
      return sendPushNotificationsAsync(messages);
    }
  },
}));

const { buildPushMessage, correctNotification } = await import(
  "../src/lib/expo-push-service"
);

beforeEach(() => {
  update.mockClear();
  queue.mockClear();
  sendPushNotificationsAsync.mockClear();
});

describe("buildPushMessage", () => {
  it("uses the campaign id as the OS collapse id and tag", () => {
    const message = buildPushMessage({
      notification: notification as never,
      notificationId: "n-1",
      token: "ExponentPushToken[one]",
      deviceToken: "t-1",
      name: "Ada Obi",
    });

    expect(message.collapseId).toBe("n-1");
    expect(message.tag).toBe("n-1");
    expect(message.title).toBe("Ada, a correction");
  });
});

describe("correctNotification", () => {
  it("re-sends to the original devices and updates inbox rows in place", async () => {
    const result = await correctNotification("n-1", {
      payload,
    } as never);

    expect(result).toEqual({ recipients: 2 });

    const sent = sendPushNotificationsAsync.mock.calls[0]?.[0];
    expect(sent?.map((message) => message.to)).toEqual([
      "ExponentPushToken[one]",
      "ExponentPushToken[two]",
    ]);
    expect(sent?.map((message) => message.collapseId)).toEqual(["n-1", "n-1"]);

    const inboxUpdates = update.mock.calls.filter(
      ([args]) =>
        (args as { collection: string }).collection === "notification-inbox"
    );
    expect(inboxUpdates.length).toBe(2);
    expect(inboxUpdates[0]?.[0]).toMatchObject({
      data: { title: "Ada, a correction" },
    });
    expect(inboxUpdates[1]?.[0]).toMatchObject({
      data: { title: "Bola, a correction" },
    });

    const deliveryUpdates = update.mock.calls.filter(
      ([args]) =>
        (args as { collection: string }).collection ===
        "notification-deliveries"
    );
    expect(
      deliveryUpdates.map(([args]) => (args as { id: string }).id)
    ).toEqual(["d-1", "d-2"]);
    expect(deliveryUpdates[0]?.[0]).toMatchObject({
      data: { status: "pending", expoTicketId: "ticket-0" },
    });

    expect(queue).toHaveBeenCalledTimes(1);
  });

  it("refuses a notification that has not been sent", async () => {
    payload.findByID.mockImplementationOnce(
      async () => ({ ...notification, sentAt: null }) as never
    );

    await expect(
      correctNotification("n-1", { payload } as never)
    ).rejects.toThrow("Only a notification that has been sent");

    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
  });
});
