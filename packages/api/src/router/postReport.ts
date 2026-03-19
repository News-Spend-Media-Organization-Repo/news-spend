import z from "zod";

import { protectedNoGuestProcedure } from "../index";

// Schema for post report input
const postReportSchema = z.object({
  reportType: z.enum(["comment", "news"]),
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
    const { reportedItem } = input;

    const response = await payload.create({
      collection: "contentReports",
      data: {
        reportedBy: user.id,
        reportType: input.reportType,
        reportedItem: {
          relationTo: input.reportType === "comment" ? "comments" : "news",
          value: reportedItem,
        },
        reason: input.reason,
        additionalDetails: input.additionalDetails,
      },
    });

    return response;
  });

export const postReportRouter = {
  create: createPostReport,
};
