import { ORPCError } from "@orpc/client";
import z from "zod";

import { protectedNoGuestProcedure, publicProcedure } from "../index";
import { createRateLimitMiddleware } from "../lib/ratelimit";

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

const allComments = publicProcedure
  .input(allCommentsInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const comments = await payload.find({
      collection: "comments",
      where: {
        ...(input.parentId
          ? { parent: { equals: input.parentId } }
          : { parent: { exists: false } }),
        "news.id": {
          equals: input.newsId,
        },
      },
      sort: "-createdAt",
      limit: input.limit || 10,
      page: input.page || 1,
    });

    return comments;
  });

const getComment = publicProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context }) => {
    const { payload } = context;
    return await payload.findByID({
      collection: "comments",
      id: commentId,
      depth: 3,
    });
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
      typeof user === "string" ? user === userId : user?.id === userId
    );

    let operation: any;
    if (userDislikedIndex === -1 || userDislikedIndex === undefined) {
      operation = {
        dislikes: [...(comment.dislikes || []), userId],
      };
    } else {
      // User has already disliked the comment, so remove their ID
      operation = {
        dislikes: comment.dislikes?.filter(
          (_, index) => index !== userDislikedIndex
        ),
      };
    }

    const updatedComment = await payload.update({
      collection: "comments",
      id: commentId,
      data: operation,
    });

    return updatedComment;
  });

const likeComment = protectedNoGuestProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context }) => {
    const { payload, user } = context;
    const userId = user.id;

    const comment = await payload.findByID({
      collection: "comments",
      id: commentId,
    });

    if (!comment) {
      throw new ORPCError("NOT_FOUND", {
        message: "Comment not found",
      });
    }

    const userLikedIndex = comment.likes?.findIndex((user) =>
      typeof user === "string" ? user === userId : user.id === userId
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
    });

    return updatedComment;
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
