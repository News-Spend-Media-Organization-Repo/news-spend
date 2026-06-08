import type { PushToken } from "@news-spend-media/payload/types";
import { subDays } from "date-fns";
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import type { PayloadRequest, Where } from "payload";

import type { Notification } from "../payload-types";
import { getPayload } from "./getPayload";

/**
 * Maps notification campaign types to user preference keys.
 * Only notifications with a mapped preference key are filtered.
 * Types without a mapping (e.g., "promo") are sent to all users.
 */
const NOTIFICATION_TYPE_TO_PREFERENCE: Record<string, string | undefined> = {
  breaking_news: "BREAKING_NEWS",
  news: "NEWS",
  misc: "MISC",
  promo: undefined,
};

async function resolveTokens(
  notification: Notification,
  req: PayloadRequest,
): Promise<PushToken[]> {
  const payload = await getPayload();

  const deviceTypes = notification.deviceTypes ?? [];
  const deviceTypeWhere: Where | undefined =
    deviceTypes.length && !deviceTypes.includes("all")
      ? { deviceType: { in: deviceTypes } }
      : undefined;

  if (notification.targetType === "all") {
    const preferenceKey = NOTIFICATION_TYPE_TO_PREFERENCE[notification.type ?? "misc"];

    if (preferenceKey) {
      const { docs: users } = await payload.find({
        collection: "users",
        where: {
          [`notificationPreferences.types.${preferenceKey}`]: { equals: true },
        },
        pagination: false,
        req,
      });

      if (!users.length) {
        return [];
      }

      const result = await payload.find({
        collection: "push-tokens",
        where: {
          user: { in: users.map((user) => user.id) },
          ...deviceTypeWhere,
        },
        pagination: false,
        req,
      });
      return result.docs;
    }

    const result = await payload.find({
      collection: "push-tokens",
      where: deviceTypeWhere,
      pagination: false,
      req,
    });
    return result.docs;
  }

  if (notification.targetType === "segment" && notification.segment) {
    return resolveSegmentTokens(notification.segment, deviceTypeWhere, req);
  }

  if (notification.targetType === "specific" && notification.specificUsers?.length) {
    const specificUserIds = notification.specificUsers.map((user) =>
      typeof user === "string" ? user : user.id,
    );

    const result = await payload.find({
      collection: "push-tokens",
      where: {
        user: { in: specificUserIds },
        ...deviceTypeWhere,
      },
      pagination: false,
      req,
    });
    return result.docs;
  }

  return [];
}

async function resolveSegmentTokens(
  segment: string,
  deviceTypeWhere: Where | undefined,
  req: PayloadRequest,
): Promise<PushToken[]> {
  const payload = await getPayload();

  const segmentWhere: Where = { ...deviceTypeWhere };

  if (segment === "active-users") {
    segmentWhere["user.lastActiveAt"] = {
      greater_than: subDays(new Date(), 30).getTime(),
    };
  } else if (segment === "inactive-users") {
    segmentWhere["user.lastActiveAt"] = {
      less_than: subDays(new Date(), 30).getTime(),
    };
  } else if (segment === "new-users") {
    segmentWhere["user.createdAt"] = {
      greater_than: subDays(new Date(), 7).getTime(),
    };
  } else {
    return [];
  }

  const result = await payload.find({
    collection: "push-tokens",
    where: segmentWhere,
    pagination: false,
    req,
  });
  return result.docs;
}

function extractUserId(token: PushToken): string | undefined {
  if (typeof token.user === "object" && token.user !== null) {
    return (token.user as { id: string }).id;
  }
  return token.user as string | undefined;
}

async function handleFailedTicket(
  ticket: ExpoPushTicket,
  token: PushToken,
  req: PayloadRequest,
): Promise<void> {
  const payload = await getPayload();
  const errorCode = (ticket as { details?: { error?: string } }).details?.error;
  if (errorCode === "DeviceNotRegistered") {
    await payload.delete({
      collection: "push-tokens",
      where: { token: { equals: token.token } },
      req,
    });
  }
}

async function createInboxEntry(opts: {
  userId: string;
  notification: Notification;
  req: PayloadRequest;
}): Promise<void> {
  const { userId, notification, req } = opts;
  const payload = await getPayload();
  await payload.create({
    collection: "notification-inbox",
    data: {
      user: userId,
      notification: notification.id,
      title: notification.title,
      body: notification.body,
      ...(notification.data &&
      typeof notification.data === "object" &&
      !Array.isArray(notification.data)
        ? { data: notification.data as Record<string, unknown> }
        : {}),
      type: notification.type ?? "misc",
      clickCount: 0,
    },
    req,
  });
}

async function recordDeliveryAndInbox(opts: {
  ticket: ExpoPushTicket;
  token: PushToken;
  notification: Notification;
  now: Date;
  inboxUsersSeen: Set<string>;
  req: PayloadRequest;
}): Promise<void> {
  const { ticket, token, notification, now, inboxUsersSeen, req } = opts;
  const payload = await getPayload();

  const userId = extractUserId(token);
  const isOk = ticket.status === "ok";
  const expoTicketId = isOk ? ticket.id : undefined;

  await payload.create({
    collection: "notification-deliveries",
    data: {
      notification: notification.id,
      user: userId ?? null,
      pushToken: token.token,
      deviceToken: token.id,
      status: isOk ? "pending" : "failed",
      ...(expoTicketId ? { expoTicketId } : {}),
      ...(!isOk && ticket.status === "error"
        ? { errorMessage: ticket.message ?? "Unknown error" }
        : {}),
    },
    req,
  });

  if (!isOk) {
    await handleFailedTicket(ticket, token, req);
    return;
  }

  await payload.update({
    collection: "push-tokens",
    id: token.id,
    data: { lastUsed: now.toISOString() },
    req,
  });

  if (userId && !inboxUsersSeen.has(userId)) {
    inboxUsersSeen.add(userId);
    await createInboxEntry({ userId, notification, req });
  }
}

async function sendChunks(
  expo: Expo,
  messages: ExpoPushMessage[],
  req: PayloadRequest,
  notificationId: string,
): Promise<ExpoPushTicket[]> {
  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...chunkTickets);
    } catch (err) {
      req.payload.logger.error({
        msg: "sendNotification: chunk send failed",
        err,
        notificationId,
      });
    }
  }

  return tickets;
}

async function processTickets(opts: {
  tickets: ExpoPushTicket[];
  deviceTokens: PushToken[];
  notification: Notification;
  now: Date;
  req: PayloadRequest;
}): Promise<void> {
  const { tickets, deviceTokens, notification, now, req } = opts;
  const inboxUsersSeen = new Set<string>();
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    const token = deviceTokens[i];
    if (!(ticket && token)) {
      continue;
    }
    await recordDeliveryAndInbox({
      ticket,
      token,
      notification,
      now,
      inboxUsersSeen,
      req,
    });
  }
}

export async function sendNotification(notificationId: string, req: PayloadRequest): Promise<void> {
  const payload = await getPayload();

  try {
    const notification = await payload.findByID({
      collection: "notifications",
      id: notificationId,
      req,
    });

    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`);
    }

    const now = new Date();

    const expo = new Expo();
    const deviceTokens = await resolveTokens(notification, req);

    const messages: ExpoPushMessage[] = deviceTokens.map((token) => ({
      to: token.token,
      title: notification.title,
      body: notification.body,
      data: {
        ...(notification.data &&
        typeof notification.data === "object" &&
        !Array.isArray(notification.data)
          ? (notification.data as Record<string, unknown>)
          : {}),
        notificationId,
        deviceToken: token.id,
      },
      sound: notification.sound ? "default" : null,
      badge: notification.badge ?? undefined,
      priority: notification.priority as ExpoPushMessage["priority"],
    }));

    const tickets = await sendChunks(expo, messages, req, notificationId);

    await processTickets({ tickets, deviceTokens, notification, now, req });

    await payload.update({
      collection: "notifications",
      id: notificationId,
      data: { sentAt: now.toISOString() },
      req,
    });

    // Queue receipt polling ~30 minutes from now
    await req.payload.jobs.queue({
      task: "checkPushReceipts",
      input: { notificationId },
      waitUntil: new Date(Date.now() + 30 * 60 * 1000),
    });
  } catch (error) {
    req.payload.logger.error({
      msg: "sendNotification: failed",
      err: error,
      notificationId,
    });

    throw error;
  }
}
