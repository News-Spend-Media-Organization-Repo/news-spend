import z from "zod";

import { publicProcedure } from "../index";

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

export const notificationsRouter = {
  trackOpen,
};
