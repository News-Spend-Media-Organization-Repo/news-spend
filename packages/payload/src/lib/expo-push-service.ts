import type { PushToken } from "@news-spend-media/payload/types";
import { subDays } from "date-fns";
import {
  Expo,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from "expo-server-sdk";
import type { PayloadRequest, Where } from "payload";
import { forYouRecipients, readProfile } from "../opportunities/model";
import type { Notification } from "../payload-types";
import { getPayload } from "./getPayload";
import { hasPlaceholder, personalise } from "./personalise";

/**
 * Maps notification campaign types to user preference keys.
 * Only notifications with a mapped preference key are filtered.
 * Types without a mapping (e.g., "promo") are sent to all users.
 */
const NOTIFICATION_TYPE_TO_PREFERENCE: Record<string, string | undefined> = {
  breaking_news: "BREAKING_NEWS",
  news: "NEWS",
  comment: "COMMENT",
  misc: "MISC",
  promo: undefined,
};

/**
 * Android notification channel to deliver on (registered client-side in
 * usePushNotification.tsx). "comment" notifications cover two different
 * kinds of activity: a reply (data.kind: "reply") and a like
 * (data.kind: "like"), which get their own channels so a user can turn
 * down low-signal like notifications on Android without also muting
 * replies, while still sharing the same COMMENT preference toggle that
 * gates whether either is sent at all. Everything else falls back to the
 * pre-existing "default" channel.
 */
function resolveChannelId(notification: Notification): string {
  if (notification.type !== "comment") {
    return "default";
  }
  const data =
    notification.data &&
    typeof notification.data === "object" &&
    !Array.isArray(notification.data)
      ? (notification.data as Record<string, unknown>)
      : undefined;
  return data?.kind === "like" ? "likes" : "comments";
}

/**
 * All push-tokens queries here sort by id. The job queue runs multiple
 * notification jobs concurrently (Promise.all), and processTickets() later
 * updates each returned token's row sequentially within its own job. Without
 * a deterministic order, two concurrent jobs whose token sets overlap could
 * acquire those row locks in different relative orders and deadlock in
 * Postgres. Sorting guarantees every job walks overlapping rows in the same
 * order, so a circular wait can't form.
 */
async function resolveTokens(
  notification: Notification,
  req: PayloadRequest
): Promise<PushToken[]> {
  const payload = await getPayload();

  const deviceTypes = notification.deviceTypes ?? [];
  const deviceTypeWhere: Where | undefined =
    deviceTypes.length && !deviceTypes.includes("all")
      ? { deviceType: { in: deviceTypes } }
      : undefined;

  if (notification.targetType === "all") {
    const preferenceKey =
      NOTIFICATION_TYPE_TO_PREFERENCE[notification.type ?? "misc"];

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
        sort: "id",
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
      sort: "id",
      where: deviceTypeWhere,
      pagination: false,
      req,
    });
    return result.docs;
  }

  if (notification.targetType === "segment" && notification.segment) {
    return resolveSegmentTokens(notification.segment, deviceTypeWhere, req);
  }

  if (
    notification.targetType === "specific" &&
    notification.specificUsers?.length
  ) {
    let specificUserIds = notification.specificUsers.map((user) =>
      typeof user === "string" ? user : user.id
    );
    const metadata =
      notification.data &&
      typeof notification.data === "object" &&
      !Array.isArray(notification.data)
        ? notification.data
        : null;
    const forYouKind = metadata?.forYouKind;
    if (
      forYouKind === "deadlines" ||
      forYouKind === "discovery" ||
      forYouKind === "opportunities"
    ) {
      const candidates = specificUserIds;
      const profiles = await payload.find({
        collection: "opportunity-profiles",
        where: { user: { in: candidates } },
        limit: candidates.length,
        depth: 0,
        req,
      });
      const byUser = new Map(
        profiles.docs.map((stored) => [
          typeof stored.user === "string" ? stored.user : stored.user.id,
          readProfile(stored.preferences),
        ])
      );
      specificUserIds = forYouRecipients(specificUserIds, byUser, forYouKind);
      if (
        forYouKind === "deadlines" &&
        typeof metadata?.opportunityId === "string"
      ) {
        const saved = await payload.find({
          collection: "saved-opportunities",
          where: {
            and: [
              { user: { in: specificUserIds } },
              { opportunity: { equals: metadata.opportunityId } },
              { reminderAt: { exists: true } },
            ],
          },
          limit: specificUserIds.length,
          depth: 0,
          req,
        });
        specificUserIds = saved.docs.map((item) =>
          typeof item.user === "string" ? item.user : item.user.id
        );
      }
      if (!specificUserIds.length) {
        return [];
      }
    }

    const result = await payload.find({
      collection: "push-tokens",
      sort: "id",
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
  req: PayloadRequest
): Promise<PushToken[]> {
  const payload = await getPayload();

  const segmentWhere: Where = { ...deviceTypeWhere };

  /**
   * Segment boundaries are absolute instants, expressed as ISO strings.
   *
   * Two things were wrong here and both silently emptied the audience. The
   * field was queried as `lastActiveAt`, which does not exist on users (it is
   * `lastActive`), and Payload throws a `QueryError` for an unqueryable path,
   * so a segment send raised rather than delivered. The bounds were also
   * passed as epoch numbers from `.getTime()`, which is not a value a date
   * column can be compared against.
   *
   * `.toISOString()` is what makes this timezone-proof: the cutoff is one
   * instant in UTC, so it means the same thing regardless of where the
   * administrator who scheduled the notification happens to be sitting.
   */
  const activeCutoff = subDays(new Date(), 30).toISOString();
  const newUserCutoff = subDays(new Date(), 7).toISOString();

  if (segment === "active-users") {
    segmentWhere["user.lastActive"] = { greater_than: activeCutoff };
  } else if (segment === "inactive-users") {
    /*
     * A reader with no recorded activity at all is inactive, not unknown.
     * `lastActive` only began being written recently, so every account that
     * predates it holds null, and a bare `less_than` would quietly exclude
     * exactly the dormant readers this segment exists to reach.
     */
    segmentWhere.or = [
      { "user.lastActive": { less_than: activeCutoff } },
      { "user.lastActive": { exists: false } },
    ];
  } else if (segment === "new-users") {
    segmentWhere["user.createdAt"] = { greater_than: newUserCutoff };
  } else {
    return [];
  }

  const result = await payload.find({
    collection: "push-tokens",
    sort: "id",
    where: segmentWhere,
    pagination: false,
    req,
  });
  return result.docs;
}

function idOf(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return;
}

function extractUserId(token: PushToken): string | undefined {
  return idOf(token.user);
}

async function handleFailedTicket(
  ticket: ExpoPushTicket,
  token: string,
  req: PayloadRequest
): Promise<void> {
  const payload = await getPayload();
  const errorCode = (ticket as { details?: { error?: string } }).details?.error;
  if (errorCode === "DeviceNotRegistered") {
    await payload.delete({
      collection: "push-tokens",
      where: { token: { equals: token } },
      req,
    });
  }
}

/**
 * The body for one recipient. `{{firstName}}` is filled from the user already
 * populated on the push token, so personalising costs no extra query. A token
 * whose user was not populated simply gets the no-name fallback.
 */
function userNameOf(token: PushToken): string | null {
  return typeof token.user === "object" && token.user !== null
    ? token.user.name
    : null;
}

function personalised(value: string, name: string | null): string {
  return hasPlaceholder(value) ? personalise(value, name) : value;
}

/** Fill `{{firstName}}` in a push title for one recipient; plain titles pass through. */
export function titleFor(notification: Notification, token: PushToken): string {
  return personalised(notification.title, userNameOf(token));
}

function bodyFor(notification: Notification, token: PushToken): string {
  return personalised(notification.body, userNameOf(token));
}

/**
 * One Expo message. `collapseId` (iOS) and `tag` (Android) carry the campaign
 * id, so re-sending a campaign replaces the notification still in the tray
 * instead of stacking a duplicate. A different campaign has a different id and
 * still stacks as before.
 */
export function buildPushMessage(opts: {
  notification: Notification;
  notificationId: string;
  token: string;
  deviceToken: string;
  name: string | null;
}): ExpoPushMessage {
  const { notification, notificationId, token, deviceToken, name } = opts;

  return {
    to: token,
    title: personalised(notification.title, name),
    body: personalised(notification.body, name),
    channelId: resolveChannelId(notification),
    data: {
      ...(notification.data &&
      typeof notification.data === "object" &&
      !Array.isArray(notification.data)
        ? (notification.data as Record<string, unknown>)
        : {}),
      notificationId,
      deviceToken,
    },
    sound: notification.sound ? "default" : null,
    badge: notification.badge ?? undefined,
    priority: notification.priority as ExpoPushMessage["priority"],
    collapseId: notificationId,
    tag: notificationId,
  };
}

async function createInboxEntry(opts: {
  userId: string;
  title: string;
  body: string;
  notification: Notification;
  req: PayloadRequest;
}): Promise<void> {
  const { userId, title, body, notification, req } = opts;
  const payload = await getPayload();
  await payload.create({
    collection: "notification-inbox",
    data: {
      user: userId,
      notification: notification.id,
      title,
      body,
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
    await handleFailedTicket(ticket, token.token, req);
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
    await createInboxEntry({
      userId,
      title: titleFor(notification, token),
      body: bodyFor(notification, token),
      notification,
      req,
    });
  }
}

async function sendChunks(
  expo: Expo,
  messages: ExpoPushMessage[],
  req: PayloadRequest,
  notificationId: string
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

/**
 * Re-send a campaign that has already gone out, to the devices it originally
 * reached.
 *
 * A push cannot be recalled, so the only correction is another push. Sending
 * it with the same `collapseId`/`tag` replaces the notification where it is
 * still visible instead of stacking a second one, and the inbox rows are
 * updated in place so the in-app history does not gain a duplicate.
 */
export async function correctNotification(
  notificationId: string,
  req: PayloadRequest
): Promise<{ recipients: number }> {
  const payload = await getPayload();

  const notification = await payload.findByID({
    collection: "notifications",
    id: notificationId,
    req,
  });

  if (!notification?.sentAt) {
    throw new Error("Only a notification that has been sent can be corrected.");
  }

  const { docs } = await payload.find({
    collection: "notification-deliveries",
    where: {
      and: [
        { notification: { equals: notificationId } },
        { status: { not_equals: "failed" } },
      ],
    },
    pagination: false,
    depth: 0,
    req,
  });

  const deliveries = docs.filter((delivery) => delivery.pushToken);
  if (!deliveries.length) {
    return { recipients: 0 };
  }

  const userIds = [
    ...new Set(
      deliveries
        .map((delivery) => idOf(delivery.user))
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const nameById = new Map<string, string | null>();
  if (userIds.length) {
    const { docs: users } = await payload.find({
      collection: "users",
      where: { id: { in: userIds } },
      pagination: false,
      depth: 0,
      req,
    });
    for (const user of users) {
      nameById.set(user.id, user.name ?? null);
    }
  }

  for (const userId of userIds) {
    const name = nameById.get(userId) ?? null;
    await payload.update({
      collection: "notification-inbox",
      where: {
        and: [
          { notification: { equals: notificationId } },
          { user: { equals: userId } },
        ],
      },
      data: {
        title: personalised(notification.title, name),
        body: personalised(notification.body, name),
      },
      req,
    });
  }

  const messages = deliveries.map((delivery) =>
    buildPushMessage({
      notification,
      notificationId,
      token: delivery.pushToken,
      deviceToken: idOf(delivery.deviceToken) ?? "",
      name: nameById.get(idOf(delivery.user) ?? "") ?? null,
    })
  );

  const expo = new Expo();
  const tickets = await sendChunks(expo, messages, req, notificationId);

  let sent = 0;
  for (let i = 0; i < deliveries.length; i++) {
    const delivery = deliveries[i];
    const ticket = tickets[i];
    if (!(delivery && ticket)) {
      continue;
    }

    if (ticket.status === "ok") {
      sent += 1;
      await payload.update({
        collection: "notification-deliveries",
        id: delivery.id,
        data: {
          status: "pending",
          expoTicketId: ticket.id,
          errorMessage: null,
          deliveredAt: null,
        },
        req,
      });
    } else {
      await payload.update({
        collection: "notification-deliveries",
        id: delivery.id,
        data: {
          status: "failed",
          errorMessage: ticket.message ?? "Unknown error",
        },
        req,
      });
      await handleFailedTicket(ticket, delivery.pushToken, req);
    }
  }

  if (sent > 0) {
    await req.payload.jobs.queue({
      task: "checkPushReceipts",
      input: { notificationId },
      waitUntil: new Date(Date.now() + 30 * 60 * 1000),
    });
  }

  return { recipients: sent };
}

export async function sendNotification(
  notificationId: string,
  req: PayloadRequest
): Promise<void> {
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

    const messages: ExpoPushMessage[] = deviceTokens.map((token) =>
      buildPushMessage({
        notification,
        notificationId,
        token: token.token,
        deviceToken: token.id,
        name: userNameOf(token),
      })
    );

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
