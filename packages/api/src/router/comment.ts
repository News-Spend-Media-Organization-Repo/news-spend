import type { Payload, Where } from "payload";
import z from "zod";
import { protectedNoGuestProcedure, publicProcedure } from "../index";
import { CONTENT_FILTER_MESSAGE, screenText } from "../lib/content-filter";
import { createRateLimitMiddleware } from "../lib/ratelimit";
import {
  getBlockedUserIdsForNews,
  getReportedCommentIdsForNews,
  hasBlockedUser,
  hasReportedComment,
} from "./comment/moderation-filters";
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
 * reconcile the optimistic cache write with server truth; no refetch needed,
 * so the icon doesn't get clobbered by a stale read.
 */
type ReactionResponse = {
  userReaction: UserReaction;
  likesCount: number;
  dislikesCount: number;
};

/**
 * Excludes auto-hidden and moderator-removed comments from public reads.
 *
 * Written as an explicit OR rather than `not_in` because comments created
 * before `moderationStatus` existed have NULL, and SQL's `NOT IN` drops NULL
 * rows, which would hide the entire pre-existing comment history.
 */
const VISIBLE_COMMENTS_FILTER: Where = {
  or: [
    { moderationStatus: { equals: "visible" } },
    { moderationStatus: { exists: false } },
  ],
};

/**
 * Records a filter rejection so repeat offenders are visible to moderators,
 * who would otherwise never learn that a user keeps trying to post slurs.
 * The comment is never created, so it leaves no other trace.
 *
 * Deliberately stores only the matched term and severity, never the attempted
 * text: the point of the filter is that objectionable content is not persisted.
 * Marked resolved because there is nothing for a moderator to action; the
 * content never reached anyone.
 */
async function recordFilterRejection(
  payload: Payload,
  userId: string,
  screening: { severity: "severe" | "profanity"; matched: string },
  context: string
) {
  try {
    await payload.create({
      collection: "contentReports",
      data: {
        type: "filterRejection",
        reason:
          screening.severity === "severe" ? "hate-speech" : "inappropriate",
        additionalDetails: `Content filter blocked a ${screening.severity} term ("${screening.matched}") on ${context}.`,
        reportedBy: userId,
        status: "resolved",
      },
    });
  } catch (error) {
    // Never turn a rejected comment into a 500 because bookkeeping failed.
    payload.logger.error(
      { error, userId },
      "Failed to record content filter rejection"
    );
  }
}

// Procedures

const allComments = publicProcedure
  .input(allCommentsInput)
  .handler(async ({ input, context }) => {
    const { payload, user } = context;

    // Scoped to this article rather than the viewer's lifetime history, so the
    // exclusion lists stay small however much they have blocked or reported.
    const [blockedUserIds, reportedCommentIds] = user
      ? await Promise.all([
          getBlockedUserIdsForNews(payload, user.id, input.newsId),
          getReportedCommentIdsForNews(payload, user.id, input.newsId),
        ])
      : [[], []];

    const baseWhere = {
      ...(input.parentId
        ? { parent: { equals: input.parentId } }
        : { parent: { exists: false } }),
      "news.id": {
        equals: input.newsId,
      },
    };

    const filters: Where[] = [VISIBLE_COMMENTS_FILTER];
    if (blockedUserIds.length > 0) {
      filters.push({ "user.id": { not_in: blockedUserIds } });
    }
    if (reportedCommentIds.length > 0) {
      filters.push({ id: { not_in: reportedCommentIds } });
    }

    const where = { and: [baseWhere, ...filters] };

    const comments = await payload.find({
      collection: "comments",
      where,
      /*
       * Top-level comments are newest-first, the usual "what's being said
       * now" ordering. Replies are oldest-first: a thread is a conversation
       * and reads from the start, and it has to match the inline preview on
       * the list screen - otherwise the two replies shown under a comment
       * are not the two at the top of the thread you land on.
       */
      sort: input.parentId ? "createdAt" : "-createdAt",
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

    /*
     * Preview replies for the redesigned card, which shows the first couple
     * of replies inline instead of making every thread a screen push.
     *
     * One query for the whole page rather than one per comment - a page of
     * 10 comments would otherwise be 10 extra round trips. Ordered oldest
     * first, because a preview of a conversation reads from the start;
     * the full thread screen keeps its own ordering.
     */
    const previewByParent = input.parentId
      ? new Map<string, typeof docs>()
      : await fetchPreviewReplies({
          blockedUserIds,
          commentIds,
          payload,
          reportedCommentIds,
          user,
        });

    const enrichedDocs = docs.map((doc) => ({
      ...doc,
      user:
        typeof doc.user === "string"
          ? (users.get(doc.user) ?? { id: doc.user, username: "" })
          : doc.user,
      userReaction: reactions.get(doc.id) ?? ("none" as const),
      previewReplies: previewByParent.get(doc.id) ?? [],
    }));

    return { ...comments, docs: enrichedDocs };
  });

/** How many replies each top-level comment carries inline on the list screen. */
const PREVIEW_REPLIES_PER_COMMENT = 2;

/**
 * Fetches the first few replies for each of `commentIds` in a single query.
 *
 * Over-fetches (limit = parents x per-parent x 4) and trims per parent in
 * memory, because there is no per-group limit in the query layer. The
 * multiplier is slack for lopsided threads - one comment with 40 replies
 * would otherwise swallow the whole budget and leave its siblings with
 * nothing to preview.
 */
async function fetchPreviewReplies({
  blockedUserIds,
  commentIds,
  payload,
  reportedCommentIds,
  user,
}: {
  blockedUserIds: string[];
  commentIds: string[];
  payload: Payload;
  reportedCommentIds: string[];
  user?: { id: string } | null;
}) {
  const byParent = new Map<string, Record<string, unknown>[]>();
  if (commentIds.length === 0) {
    return byParent;
  }

  const filters: Where[] = [
    VISIBLE_COMMENTS_FILTER,
    { parent: { in: commentIds } },
  ];
  if (blockedUserIds.length > 0) {
    filters.push({ "user.id": { not_in: blockedUserIds } });
  }
  if (reportedCommentIds.length > 0) {
    filters.push({ id: { not_in: reportedCommentIds } });
  }

  const replies = await payload.find({
    collection: "comments",
    depth: 0,
    limit: commentIds.length * PREVIEW_REPLIES_PER_COMMENT * 4,
    sort: "createdAt",
    where: { and: filters },
  });

  const replyDocs = replies.docs as unknown as Array<
    {
      id: string;
      parent?: string | { id: string };
      user?: string | { id: string; username?: string };
    } & Record<string, unknown>
  >;

  const [replyReactions, replyUsers] = await Promise.all([
    getUserReactionsForComments(
      payload,
      user?.id,
      replyDocs.map((d) => d.id)
    ),
    getUsersMinimal(
      payload,
      replyDocs
        .map((d) => (typeof d.user === "string" ? d.user : d.user?.id))
        .filter((id): id is string => Boolean(id))
    ),
  ]);

  for (const reply of replyDocs) {
    const parentId =
      typeof reply.parent === "string" ? reply.parent : reply.parent?.id;
    if (!parentId) {
      continue;
    }
    const bucket = byParent.get(parentId) ?? [];
    if (bucket.length >= PREVIEW_REPLIES_PER_COMMENT) {
      continue;
    }
    bucket.push({
      ...reply,
      user:
        typeof reply.user === "string"
          ? (replyUsers.get(reply.user) ?? { id: reply.user, username: "" })
          : reply.user,
      userReaction: replyReactions.get(reply.id) ?? ("none" as const),
    });
    byParent.set(parentId, bucket);
  }

  return byParent;
}

const getComment = publicProcedure
  .input(z.string())
  .handler(async ({ input: commentId, context, errors }) => {
    const { payload, user } = context;
    const doc = await payload.findByID({
      collection: "comments",
      id: commentId,
      depth: 0,
    });

    // Hidden/removed comments are not readable by anyone on the public API,
    // signed in or not. NULL means "created before moderation existed".
    if (
      doc?.moderationStatus === "hidden" ||
      doc?.moderationStatus === "removed"
    ) {
      throw errors.NOT_FOUND({
        message: "Comment not found",
      });
    }

    if (user && doc) {
      const commentUserId =
        typeof doc.user === "string" ? doc.user : doc.user?.id;
      if (commentUserId) {
        // Two targeted existence checks rather than loading the viewer's whole
        // block list and report history to test a single comment.
        const [blocked, reported] = await Promise.all([
          hasBlockedUser(payload, user.id, commentUserId),
          hasReportedComment(payload, user.id, commentId),
        ]);

        if (blocked || reported) {
          throw errors.NOT_FOUND({
            message: "Comment not found",
          });
        }
      }
    }
    const [userReaction, users] = await Promise.all([
      getUserReactionForComment(payload, user?.id, commentId),
      getUsersMinimal(
        payload,
        typeof doc?.user === "string"
          ? [doc.user]
          : doc?.user?.id
            ? [doc.user.id]
            : []
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
  .use(createRateLimitMiddleware({ maxRequests: 10, window: 60_000 }))
  .input(CommentInput)
  .handler(async ({ input: comment, context, errors }) => {
    const { payload, user } = context;

    const screening = screenText(comment.text);
    if (!screening.ok) {
      payload.logger.warn(
        {
          userId: user.id,
          newsId: comment.newsId,
          severity: screening.severity,
          matched: screening.matched,
        },
        "Comment rejected by content filter"
      );
      await recordFilterRejection(payload, user.id, screening, "a new comment");
      throw errors.BAD_REQUEST({ message: CONTENT_FILTER_MESSAGE });
    }

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
  .handler(async ({ input, context, errors }) => {
    const { payload, user } = context;

    const comment = await payload.findByID({
      collection: "comments",
      id: input.commentId,
      depth: 0,
    });

    if (!comment) {
      throw errors.NOT_FOUND({
        message: "Comment not found",
      });
    }

    const commentUser =
      typeof comment.user === "string" ? comment.user : comment.user.id;

    if (commentUser !== user.id) {
      throw errors.NOT_FOUND({
        message: "Comment not found",
      });
    }

    const createdAt = new Date(comment.createdAt).getTime();
    const elapsed = Date.now() - createdAt;

    if (elapsed >= DELETE_WINDOW_MS) {
      throw errors.FORBIDDEN({
        message: "Delete window has expired",
        data: { expiredAt: createdAt + DELETE_WINDOW_MS },
      });
    }

    // Screened on edit too, so a clean comment can't be rewritten into an
    // objectionable one inside the edit window.
    const screening = screenText(input.text);
    if (!screening.ok) {
      payload.logger.warn(
        {
          userId: user.id,
          commentId: input.commentId,
          severity: screening.severity,
          matched: screening.matched,
        },
        "Comment edit rejected by content filter"
      );
      await recordFilterRejection(
        payload,
        user.id,
        screening,
        "a comment edit"
      );
      throw errors.BAD_REQUEST({ message: CONTENT_FILTER_MESSAGE });
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
  .handler(async ({ input: commentId, context, errors }) => {
    const { payload, user } = context;

    const comment = await payload.findByID({
      collection: "comments",
      id: commentId,
      depth: 0,
    });

    if (!comment) {
      throw errors.NOT_FOUND({
        message: "Comment not found",
      });
    }

    const commentUser =
      typeof comment.user === "string" ? comment.user : comment.user.id;

    if (commentUser !== user.id) {
      throw errors.NOT_FOUND({
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
