import { ORPCError } from "@orpc/client";
import z from "zod";

import { protectedNoGuestProcedure, publicProcedure } from "../index";
import { createRateLimitMiddleware } from "../lib/ratelimit";

// Enriches a single comment doc with minimal user data (id + username).
// We query comments with depth: 0 so relationships return IDs only, then
// batch-fetch the users we actually need to avoid the full Payload user
// object (which includes email, phone, sessions, accounts, etc.).
type MinimalUser = { id: string; username: string };
type CommentWithUser = {
  user?: string | MinimalUser | null;
  likes?: Array<string | MinimalUser>;
  dislikes?: Array<string | MinimalUser>;
  [key: string]: unknown;
};

async function enrichCommentWithUser(payload: any, doc: CommentWithUser): Promise<CommentWithUser> {
  const userIds = new Set<string>();
  if (typeof doc.user === "string") userIds.add(doc.user);
  for (const u of doc.likes ?? []) {
    if (typeof u === "string") userIds.add(u);
  }
  for (const u of doc.dislikes ?? []) {
    if (typeof u === "string") userIds.add(u);
  }
  if (userIds.size === 0) return doc;

  const users = await payload.find({
    collection: "users",
    where: { id: { in: [...userIds] } },
    limit: userIds.size,
    depth: 0,
  });

  const userMap = new Map<string, MinimalUser>(
    users.docs.map((u: any) => [u.id, { id: u.id, username: u.username }]),
  );

  return {
    ...doc,
    user: typeof doc.user === "string" ? (userMap.get(doc.user) ?? doc.user) : doc.user,
    likes: (doc.likes ?? []).map((u) => (typeof u === "string" ? (userMap.get(u) ?? u) : u)),
    dislikes: (doc.dislikes ?? []).map((u) => (typeof u === "string" ? (userMap.get(u) ?? u) : u)),
  };
}

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

// Procedures

const allComments = publicProcedure.input(allCommentsInput).handler(async ({ input, context }) => {
  const { payload } = context;
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

  const enrichedDocs = await Promise.all(
    comments.docs.map((doc: CommentWithUser) => enrichCommentWithUser(payload, doc)),
  );

  return { ...comments, docs: enrichedDocs };
});

const getComment = publicProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context }) => {
    const { payload } = context;
    const doc = await payload.findByID({
      collection: "comments",
      id: commentId,
      depth: 0,
    });
    return enrichCommentWithUser(payload, doc);
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

const updateComment = protectedNoGuestProcedure
  .input(updateCommentInput)
  .handler(async ({ input, context }) => {
    const { payload, user } = context;

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

    await payload.delete({
      collection: "comments",
      where: {
        user: {
          equals: user.id,
        },
        id: {
          equals: commentId,
        },
      },
    });

    return { success: true };
  });

const dislikeComment = protectedNoGuestProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context }) => {
    const { payload, user } = context;
    const userId = user.id;

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

    const userDislikedIndex = comment.dislikes?.findIndex((user) =>
      typeof user === "string" ? user === userId : user?.id === userId,
    );

    let operation: any;
    if (userDislikedIndex === -1 || userDislikedIndex === undefined) {
      operation = {
        dislikes: [...(comment.dislikes || []), userId],
      };
    } else {
      // User has already disliked the comment, so remove their ID
      operation = {
        dislikes: comment.dislikes?.filter((_, index) => index !== userDislikedIndex),
      };
    }

    const updatedComment = await payload.update({
      collection: "comments",
      id: commentId,
      data: operation,
      depth: 0,
    });

    return enrichCommentWithUser(payload, updatedComment);
  });

const likeComment = protectedNoGuestProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context }) => {
    const { payload, user } = context;
    const userId = user.id;

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

    const userLikedIndex = comment.likes?.findIndex((user) =>
      typeof user === "string" ? user === userId : user.id === userId,
    );

    let operation: any;
    if (userLikedIndex === -1 || userLikedIndex === undefined) {
      operation = {
        likes: [...(comment.likes || []), userId],
      };
    } else {
      // User has already liked the comment, so remove their ID
      operation = {
        likes: comment.likes?.filter((_, index) => index !== userLikedIndex),
      };
    }

    const updatedComment = await payload.update({
      collection: "comments",
      id: commentId,
      data: operation,
      depth: 0,
    });

    return enrichCommentWithUser(payload, updatedComment);
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
