import type { Where } from "payload";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../index";

const trackOpenInput = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  routeName: z.string().optional(),
});

const trackOpen = publicProcedure
  .input(trackOpenInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const notificationId = input.data?.notificationId as string | undefined;
    const deviceToken = input.data?.deviceToken as string | undefined;

    if (notificationId && deviceToken) {
      const { docs } = await payload.find({
        collection: "notification-deliveries",
        where: {
          and: [
            { notification: { equals: notificationId } },
            { deviceToken: { equals: deviceToken } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      if (docs[0]) {
        await payload.update({
          collection: "notification-deliveries",
          id: docs[0].id,
          data: {
            openedAt: new Date().toISOString(),
            status: "opened",
          },
        });
      }
    }

    return { success: true };
  });

const inboxListInput = z.object({
  filter: z.enum(["all", "news", "replies"]).default("all"),
  limit: z.number().int().min(1).max(50).default(20),
  page: z.number().int().min(1).default(1),
});

const inboxList = protectedProcedure
  .input(inboxListInput)
  .handler(({ input, context }) => {
    const { payload, user } = context;
    const { filter, limit, page } = input;

    const where: Where =
      filter === "news"
        ? {
            user: { equals: user.id },
            type: { in: ["news", "breaking_news"] },
          }
        : filter === "replies"
          ? { user: { equals: user.id }, type: { equals: "comment" } }
          : { user: { equals: user.id } };

    return payload.find({
      collection: "notification-inbox",
      where,
      sort: "-createdAt",
      limit,
      page,
      depth: 0,
      select: {
        title: true,
        body: true,
        imageUrl: true,
        data: true,
        type: true,
        createdAt: true,
      },
    });
  });

const inboxUnreadCount = protectedProcedure
  .input(z.object({ since: z.string().datetime().nullish() }))
  .handler(async ({ input, context }) => {
    const { payload, user } = context;
    const where: Where = input.since
      ? {
          and: [
            { user: { equals: user.id } },
            { createdAt: { greater_than: input.since } },
          ],
        }
      : { user: { equals: user.id } };

    const { totalDocs } = await payload.count({
      collection: "notification-inbox",
      where,
    });

    return Math.min(totalDocs, 99);
  });

const inboxMarkOpened = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context, errors }) => {
    const { payload, user } = context;

    const { docs } = await payload.find({
      collection: "notification-inbox",
      where: {
        and: [{ id: { equals: input.id } }, { user: { equals: user.id } }],
      },
      limit: 1,
      depth: 0,
    });

    const row = docs[0];
    if (!row) {
      throw errors.NOT_FOUND({ message: "Notification not found" });
    }

    await payload.update({
      collection: "notification-inbox",
      id: row.id,
      data: { clickCount: (row.clickCount ?? 0) + 1 },
    });

    return { success: true as const };
  });

export const notificationsRouter = {
  trackOpen,
  inbox: {
    list: inboxList,
    unreadCount: inboxUnreadCount,
    markOpened: inboxMarkOpened,
  },
};
