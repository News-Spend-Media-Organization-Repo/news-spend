import { ORPCError } from "@orpc/client";
import z from "zod";

import { protectedNoGuestProcedure } from "../index";

const blockUser = protectedNoGuestProcedure
  .input(z.object({ userId: z.string() }))
  .handler(async ({ input, context }) => {
    const { user, payload } = context;

    if (input.userId === user.id) {
      throw new ORPCError("BAD_REQUEST", {
        message: "You cannot block yourself",
      });
    }

    const userDoc = await payload.findByID({
      collection: "users",
      id: user.id,
      depth: 0,
    });

    const blockedUsers: string[] = Array.isArray(userDoc.blockedUsers)
      ? (userDoc.blockedUsers as string[])
      : [];

    if (blockedUsers.includes(input.userId)) {
      return { success: true, alreadyBlocked: true };
    }

    const updatedBlockedUsers = [...blockedUsers, input.userId];

    await payload.update({
      collection: "users",
      id: user.id,
      data: {
        blockedUsers: updatedBlockedUsers,
      },
    });

    await payload.create({
      collection: "contentReports",
      data: {
        reason: "other",
        additionalDetails: `User ${input.userId} blocked by user ${user.id}`,
        reportedBy: user.id,
        status: "pending",
      },
    });

    return { success: true };
  });

const unblockUser = protectedNoGuestProcedure
  .input(z.object({ userId: z.string() }))
  .handler(async ({ input, context }) => {
    const { user, payload } = context;

    const userDoc = await payload.findByID({
      collection: "users",
      id: user.id,
      depth: 0,
    });

    const blockedUsers: string[] = Array.isArray(userDoc.blockedUsers)
      ? (userDoc.blockedUsers as string[])
      : [];

    const updatedBlockedUsers = blockedUsers.filter(
      (id) => id !== input.userId
    );

    if (updatedBlockedUsers.length === blockedUsers.length) {
      return { success: true, notBlocked: true };
    }

    await payload.update({
      collection: "users",
      id: user.id,
      data: {
        blockedUsers: updatedBlockedUsers,
      },
    });

    return { success: true };
  });

const getBlockedUsers = protectedNoGuestProcedure.handler(
  async ({ context }) => {
    const { user, payload } = context;

    const userDoc = await payload.findByID({
      collection: "users",
      id: user.id,
      depth: 0,
    });

    const blockedUserIds: string[] = Array.isArray(userDoc.blockedUsers)
      ? (userDoc.blockedUsers as string[])
      : [];

    if (blockedUserIds.length === 0) {
      return { blockedUsers: [] as { id: string; username: string }[] };
    }

    const blockedUsersDocs = await payload.find({
      collection: "users",
      where: {
        id: { in: blockedUserIds },
      },
      depth: 0,
      limit: 500,
    });

    const blockedUsers = blockedUsersDocs.docs.map((u) => ({
      id: u.id as string,
      username: (u as Record<string, unknown>).username as string,
    }));

    return { blockedUsers };
  }
);

export const blockRouter = {
  blockUser,
  unblockUser,
  getBlockedUsers,
};
