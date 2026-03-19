import { sendNotification } from "@news-spend-media/payload/lib/lottery-notification.js";
import z from "zod";

import { publicProcedure } from "../index";

// Input schema for test notification
const TestNotificationInput = z.object({
  userId: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
  data: z.record(z.string(), z.any()).optional(),
});

const NewsCreateInput = z.object({
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.any()).optional(),
});

const LotteryNotificationInput = z.object({
  lotteryId: z.string(),
});

const testNotification = publicProcedure
  .input(TestNotificationInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const { userId, title, body, data } = input;

    // Find push tokens for the user
    const { docs: pushTokens } = await payload.find({
      collection: "push-tokens",
      where: {
        userId: {
          equals: userId,
        },
      },
    });

    if (!pushTokens.length) {
      return { success: false, message: "No push tokens found for user" };
    }

    await sendNotification({
      pushTokens,
      title: title ?? "Test Notification",
      body: body ?? "This is a test notification",
      data: data ?? {},
    });

    return { success: true };
  });

const newsCreate = publicProcedure
  .input(NewsCreateInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const { title, body, data } = input;

    // Find users with BREAKING_NEWS enabled
    const { docs: users } = await payload.find({
      collection: "users",
      where: {
        "notificationPreferences.types.BREAKING_NEWS": { equals: true },
      },
    });

    const { docs: pushTokens } = await payload.find({
      collection: "push-tokens",
      where: {
        user: { in: users.map((user) => user.id) },
      },
    });

    await sendNotification({
      pushTokens,
      title,
      body,
      data: data ?? {},
    });

    return { success: true };
  });

const sendLotteryNotification = publicProcedure
  .input(LotteryNotificationInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const { lotteryId } = input;

    // Find all participants for the lottery
    const { docs: lotteryParticipants } = await payload.find({
      collection: "lottery-tickets",
      where: {
        lottery: { equals: lotteryId },
      },
    });

    const { docs: pushTokens } = await payload.find({
      collection: "push-tokens",
      where: {
        user: {
          in: lotteryParticipants.map((lottery) =>
            typeof lottery.user === "string" ? lottery.user : lottery.user.id
          ),
        },
      },
    });

    await sendNotification({
      pushTokens,
      title: "Lottery has ended",
      body: "Check to see if you won",
      data: {
        lotteryId,
        type: "lottery",
        url: "discover",
      },
    });

    return { success: true };
  });

export const notificationsRouter = {
  testNotification,
  newsCreate,
  sendLotteryNotification,
};
