import z from "zod";

import { protectedNoGuestProcedure } from "../index";
import { createRateLimitMiddleware } from "../lib/ratelimit";

// Schema for post report input
const postReportSchema = z.object({
  relationTo: z.enum(["comments", "news"]),
  reason: z.enum([
    "spam",
    "other",
    "harassment",
    "hate-speech",
    "misinformation",
    "personal-info",
    "inappropriate",
    "off-topic",
    "trolling",
    "illegal",
  ]),
  additionalDetails: z.string(),
  reportedItem: z.string(),
});

export type PostReportInput = z.infer<typeof postReportSchema>;

export const createPostReport = protectedNoGuestProcedure
  // Reports feed the auto-hide threshold and the admin queue, so a single
  // account must not be able to flood either. Genuine reporting is bursty at
  // worst — a handful a minute is well clear of real use.
  .use(createRateLimitMiddleware({ maxRequests: 5, window: 60_000 }))
  .input(postReportSchema)
  .handler(async ({ input, context }) => {
    const { user, payload } = context;
    const { reportedItem, relationTo } = input;

    const response = await payload.create({
      collection: "contentReports",
      data: {
        reportedBy: user.id,
        reportedItem: {
          relationTo,
          value: reportedItem,
        },
        reason: input.reason,
        additionalDetails: input.additionalDetails,
      },
    });

    if (relationTo === "comments") {
      const currentUser = await payload.findByID({
        collection: "users",
        id: user.id,
        depth: 0,
      });
      const reportedComments: string[] = Array.isArray(
        currentUser.reportedComments
      )
        ? (currentUser.reportedComments as string[])
        : [];
      if (!reportedComments.includes(reportedItem)) {
        await payload.update({
          collection: "users",
          id: user.id,
          data: { reportedComments: [...reportedComments, reportedItem] },
        });
      }
    }

    return response;
  });

export const postReportRouter = {
  create: createPostReport,
};
