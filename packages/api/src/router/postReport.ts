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
  // worst: a handful a minute is well clear of real use.
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

    // No denormalized copy is kept on the user. "Comments I reported" is
    // derived from contentReports at read time (see comment/moderation-filters),
    // so there is nothing to drift when a report is dismissed or a comment
    // is deleted.
    return response;
  });

const reportReasons = postReportSchema.shape.reason;

const gameReportSchema = z.object({
  /** The game's slug, as in its universal link. */
  gameId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  reason: reportReasons,
  additionalDetails: z.string().max(1000).default(""),
});

/**
 * Report a game (Guideline 4.7.1: a way to report content, answered promptly).
 *
 * Lands in the same admin queue as reports of comments and articles, and goes
 * through the same alerting: urgent reasons page a moderator, the rest reach
 * the digest. Games are not documents, so the report names the game by slug in
 * `reportedGame` instead of pointing at a record. Nothing is hidden
 * automatically; the list of games ships with the app, so removing one is a
 * moderator's call followed by an app update.
 */
export const createGameReport = protectedNoGuestProcedure
  // Its own bucket: the default one is shared with every other limited
  // procedure, so reporting a game would spend the allowance for commenting.
  .use(
    createRateLimitMiddleware({
      name: "game-report",
      maxRequests: 5,
      window: 60_000,
    })
  )
  .input(gameReportSchema)
  .handler(async ({ input, context }) => {
    const { user, payload } = context;

    return payload.create({
      collection: "contentReports",
      data: {
        reportedBy: user.id,
        reportedGame: input.gameId,
        reason: input.reason,
        additionalDetails: input.additionalDetails,
      },
    });
  });

export const postReportRouter = {
  create: createPostReport,
  createGame: createGameReport,
};
