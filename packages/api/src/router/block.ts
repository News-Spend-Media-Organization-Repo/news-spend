import { ORPCError } from "@orpc/client";
import z from "zod";

import { protectedNoGuestProcedure } from "../index";
import { createRateLimitMiddleware } from "../lib/ratelimit";

// Each block also writes a contentReports row to notify admins, so an
// unthrottled block endpoint is a direct path to flooding the moderation queue.
const blockRateLimit = () =>
  createRateLimitMiddleware({ maxRequests: 10, window: 60_000 });

/**
 * A unique index on (blocker, blocked) makes a duplicate block a database
 * error rather than something to guard against in application code. Postgres
 * reports it as 23505; the adapter may surface it wrapped, so the code is
 * matched anywhere in the error rather than at a fixed path.
 */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; cause?: unknown };
  if (candidate.code === "23505") {
    return true;
  }
  if (candidate.cause) {
    return isUniqueViolation(candidate.cause);
  }
  return /duplicate key value|23505/i.test(String((error as Error).message));
}

const blockUser = protectedNoGuestProcedure
  .use(blockRateLimit())
  .input(z.object({ userId: z.string() }))
  .handler(async ({ input, context }) => {
    const { user, payload } = context;

    if (input.userId === user.id) {
      throw new ORPCError("BAD_REQUEST", {
        message: "You cannot block yourself",
      });
    }

    try {
      await payload.create({
        collection: "userBlocks",
        data: { blocker: user.id, blocked: input.userId },
      });
    } catch (error) {
      // Already blocked — treat as success so a double tap is harmless.
      if (isUniqueViolation(error)) {
        return { success: true, alreadyBlocked: true };
      }
      throw error;
    }

    await payload.create({
      collection: "contentReports",
      data: {
        type: "block",
        reason: "other",
        additionalDetails: `User ${input.userId} blocked by user ${user.id}`,
        reportedBy: user.id,
        status: "pending",
      },
    });

    return { success: true };
  });

const unblockUser = protectedNoGuestProcedure
  .use(blockRateLimit())
  .input(z.object({ userId: z.string() }))
  .handler(async ({ input, context }) => {
    const { user, payload } = context;

    const deleted = await payload.delete({
      collection: "userBlocks",
      where: {
        and: [
          { blocker: { equals: user.id } },
          { blocked: { equals: input.userId } },
        ],
      },
    });

    if (deleted.docs.length === 0) {
      return { success: true, notBlocked: true };
    }

    return { success: true };
  });

const getBlockedUsers = protectedNoGuestProcedure.handler(
  async ({ context }) => {
    const { user, payload } = context;

    const blocks = await payload.find({
      collection: "userBlocks",
      where: { blocker: { equals: user.id } },
      select: {
        blocked: true,
        createdAt: true,
      },
      sort: "-createdAt",
      depth: 1,
      limit: 500,
    });

    const blockedUsers = blocks.docs
      .map((doc) => {
        const blocked = doc.blocked;
        if (!blocked || typeof blocked !== "object") {
          return null;
        }
        const { id, username } = blocked;
        if (!id) {
          return null;
        }
        return {
          id,
          username: username ?? "",
          blockedAt: (doc as { createdAt?: string }).createdAt ?? null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    return { blockedUsers };
  }
);

export const blockRouter = {
  blockUser,
  unblockUser,
  getBlockedUsers,
};
