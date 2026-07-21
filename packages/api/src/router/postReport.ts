import z from "zod";

import { protectedNoGuestProcedure } from "../index";

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
