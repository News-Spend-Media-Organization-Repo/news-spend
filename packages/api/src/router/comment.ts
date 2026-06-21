import { ORPCError } from "@orpc/client";
import z from "zod";
import { protectedNoGuestProcedure, publicProcedure } from "../index";
import { createRateLimitMiddleware } from "../lib/ratelimit";
import {
  getCommentReactionCounts,
  getUserReactionForComment,
  getUserReactionsForComments,
  getUsersMinimal,
  type UserReaction,
} from "./comment/user-reaction";

// Input Schemas
const CommentInput = z.object({
  text: z.string(),
  newsId: z.string(),
  parentId: z.string().optional(),
  replyingTo: z.string().optional(),
});

const updateCommentInput = z.object({
  commentId: z.string(),
  text: z.string(),
});

const allCommentsInput = z.object({
  page: z.number().nullish().default(1),
  limit: z.number().min(1).max(100).nullish().default(10),
  newsId: z.string(),
  parentId: z.string().optional(),
});

// Types
export type CommentInput = z.infer<typeof CommentInput>;
export type UpdateCommentInput = z.infer<typeof updateCommentInput>;
export type AllCommentsInput = z.infer<typeof allCommentsInput>;

/**
 * Shared response shape returned by like/dislike. The client uses this to
 * reconcile the optimistic cache write with server truth — no refetch needed,
 * so the icon doesn't get clobbered by a stale read.
 */
type ReactionResponse = {
  userReaction: UserReaction;
  likesCount: number;
  dislikesCount: number;
};

// Procedures

const allComments = publicProcedure.input(allCommentsInput).handler(async ({ input, context }) => {
  const { payload, user } = context;
  const comments = await payload.find({
    collection: "comments",
    where: {
      ...(input.parentId ? { parent: { equals: input.parentId } } : { parent: { exists: false } }),
      "news.id": {
        equals: input.newsId,
      },
    },
    sort: "-createdAt",
    limit: input.limit || 10,
    page: input.page || 1,
    depth: 0,
  });

  const docs = comments.docs as unknown as Array<
    {
      id: string;
      user?: string | { id: string; username?: string };
    } & Record<string, unknown>
  >;
  const commentIds = docs.map((d) => d.id);
  const userIds = docs
    .map((d) => (typeof d.user === "string" ? d.user : d.user?.id))
    .filter((id): id is string => Boolean(id));

  const [reactions, users] = await Promise.all([
    getUserReactionsForComments(payload, user?.id, commentIds),
    getUsersMinimal(payload, userIds),
  ]);

  const enrichedDocs = docs.map((doc) => ({
    ...doc,
    user:
      typeof doc.user === "string"
        ? (users.get(doc.user) ?? { id: doc.user, username: "" })
        : doc.user,
    userReaction: reactions.get(doc.id) ?? ("none" as const),
  }));

  return { ...comments, docs: enrichedDocs };
});

const getComment = publicProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context }) => {
    const { payload, user } = context;
    const doc = await payload.findByID({
      collection: "comments",
      id: commentId,
      depth: 0,
    });
    const [userReaction, users] = await Promise.all([
      getUserReactionForComment(payload, user?.id, commentId),
      getUsersMinimal(
        payload,
        typeof doc?.user === "string" ? [doc.user] : doc?.user?.id ? [doc.user.id] : [],
      ),
    ]);
    const enrichedUser =
      doc?.user == null
        ? doc?.user
        : typeof doc.user === "string"
          ? (users.get(doc.user) ?? { id: doc.user, username: "" })
          : doc.user;
    return { ...doc, user: enrichedUser, userReaction };
  });

const addComment = protectedNoGuestProcedure
  .use(createRateLimitMiddleware({ maxRequests: 10, window: 60 }))
  .input(CommentInput)
  .handler(async ({ input: comment, context }) => {
    const { payload, user } = context;
    const newComment = await payload.create({
      collection: "comments",
      data: {
        news: comment.newsId,
        text: comment.text,
        user: user.id,
        parent: comment.parentId,
        replyingTo: comment.replyingTo,
      },
    });

    return newComment;
  });

const DELETE_WINDOW_MS = 15 * 60 * 1000;
const updateComment = protectedNoGuestProcedure
  .input(updateCommentInput)
  .handler(async ({ input, context }) => {
    const { payload, user } = context;

    const comment = await payload.findByID({
      collection: "comments",
      id: input.commentId,
      depth: 0,
    });

    if (!comment) {
      throw new ORPCError("NOT_FOUND", {
        message: "Comment not found",
      });
    }

    const commentUser = typeof comment.user === "string" ? comment.user : comment.user.id;

    if (commentUser !== user.id) {
      throw new ORPCError("NOT_FOUND", {
        message: "Comment not found",
      });
    }

    const createdAt = new Date(comment.createdAt).getTime();
    const elapsed = Date.now() - createdAt;

    if (elapsed >= DELETE_WINDOW_MS) {
      throw new ORPCError("FORBIDDEN", {
        message: "Delete window has expired",
        data: { expiredAt: createdAt + DELETE_WINDOW_MS },
      });
    }

    const updatedComment = await payload.update({
      collection: "comments",
      data: {
        text: input.text,
      },
      where: {
        user: {
          equals: user.id,
        },
        id: {
          equals: input.commentId,
        },
      },
    });

    return updatedComment;
  });

const deleteComment = protectedNoGuestProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context }) => {
    const { payload, user } = context;

    const comment = await payload.findByID({
      collection: "comments",
      id: commentId,
      depth: 0,
    });

    if (!comment) {
      throw new ORPCError("NOT_FOUND", {
        message: "Comment not found",
      });
    }

    const commentUser = typeof comment.user === "string" ? comment.user : comment.user.id;

    if (commentUser !== user.id) {
      throw new ORPCError("NOT_FOUND", {
        message: "Comment not found",
      });
    }

    await payload.delete({
      collection: "comments",
      id: commentId,
    });

    return { success: true };
  });

const likeComment = protectedNoGuestProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context }): Promise<ReactionResponse> => {
    const { payload, user } = context;
    const userId = user.id;

    const existing = await payload.find({
      collection: "reactions",
      where: {
        and: [
          { "target.relationTo": { equals: "comments" } },
          { "target.value": { equals: commentId } },
          { user: { equals: userId } },
        ],
      },
      limit: 1,
      depth: 0,
    });

    if (existing.docs.length > 0 && existing.docs[0]) {
      const row = existing.docs[0];
      if (row.type === "like") {
        // Toggle off: delete the row
        await payload.delete({
          collection: "reactions",
          id: row.id,
        });
      } else {
        // Switch from dislike/none to like
        await payload.update({
          collection: "reactions",
          id: row.id,
          data: { type: "like" },
        });
      }
    } else {
      // No existing reaction: create a new "like" row
      await payload.create({
        collection: "reactions",
        data: {
          user: userId,
          target: { relationTo: "comments", value: commentId },
          type: "like",
        },
      });
    }

    const [counts, userReaction] = await Promise.all([
      getCommentReactionCounts(payload, commentId),
      getUserReactionForComment(payload, userId, commentId),
    ]);
    return { userReaction, ...counts };
  });

const dislikeComment = protectedNoGuestProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context }): Promise<ReactionResponse> => {
    const { payload, user } = context;
    const userId = user.id;

    const existing = await payload.find({
      collection: "reactions",
      where: {
        and: [
          { "target.relationTo": { equals: "comments" } },
          { "target.value": { equals: commentId } },
          { user: { equals: userId } },
        ],
      },
      limit: 1,
      depth: 0,
    });

    if (existing.docs.length > 0 && existing.docs[0]) {
      const row = existing.docs[0];
      if (row.type === "dislike") {
        await payload.delete({
          collection: "reactions",
          id: row.id,
        });
      } else {
        await payload.update({
          collection: "reactions",
          id: row.id,
          data: { type: "dislike" },
        });
      }
    } else {
      await payload.create({
        collection: "reactions",
        data: {
          user: userId,
          target: { relationTo: "comments", value: commentId },
          type: "dislike",
        },
      });
    }

    const [counts, userReaction] = await Promise.all([
      getCommentReactionCounts(payload, commentId),
      getUserReactionForComment(payload, userId, commentId),
    ]);
    return { userReaction, ...counts };
  });

export const commentRouter = {
  all: allComments,
  one: getComment,
  create: addComment,
  update: updateComment,
  delete: deleteComment,
  like: likeComment,
  dislike: dislikeComment,
};
