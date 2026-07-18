import type { TaskConfig } from "payload";

import { getCommentThreadUrl } from "../lib/comment-notification-links";
import { getPayload } from "../lib/getPayload";

/**
 * Payload job task: sendCommentLikeNotification
 *
 * Debounced like-notification sender. Queued by the notifyOnCommentLike hook
 * (packages/payload/src/hooks/reactions/notifyOnCommentLike.ts) on Reactions.afterChange,
 * with a delay, so multiple likes on the same comment within the debounce
 * window collapse into a single push instead of one per like.
 *
 * Reports the most recent liker by name rather than an exact "N new likes"
 * count — this avoids needing extra persisted state to track "likes since
 * last notified", at the cost of not naming every liker if several liked
 * within the same window.
 *
 * Usage:
 *   await payload.jobs.queue({
 *     task: 'sendCommentLikeNotification',
 *     input: { commentId },
 *     waitUntil: new Date(Date.now() + DEBOUNCE_MS),
 *   })
 */
export const sendCommentLikeNotificationTask = {
  slug: "sendCommentLikeNotification",
  inputSchema: [
    {
      name: "commentId",
      type: "text",
      required: true,
    },
  ],
  outputSchema: [
    {
      name: "sent",
      type: "checkbox",
      required: true,
    },
  ],
  retries: 2,
  handler: async ({ input, req }) => {
    const payload = await getPayload();

    const comment = await payload.findByID({
      collection: "comments",
      id: input.commentId,
      depth: 0,
      req,
    });

    const authorId =
      typeof comment?.user === "string" ? comment.user : comment?.user?.id;

    if (!(authorId && comment?.likesCount && comment.likesCount > 0)) {
      return { output: { sent: false } };
    }

    const author = await payload.findByID({
      collection: "users",
      id: authorId,
      depth: 0,
      req,
    });

    if (!author?.notificationPreferences?.types?.COMMENT) {
      return { output: { sent: false } };
    }

    const latestLike = await payload.find({
      collection: "reactions",
      where: {
        "target.relationTo": { equals: "comments" },
        "target.value": { equals: input.commentId },
        type: { equals: "like" },
      },
      sort: "-createdAt",
      limit: 1,
      depth: 1,
      req,
    });

    const likerUser = latestLike.docs[0]?.user;
    const likerUsername =
      typeof likerUser === "object" ? likerUser?.username : undefined;

    if (!likerUsername) {
      return { output: { sent: false } };
    }

    // Deep link opens the thread rooted at the liked comment's parent (or
    // itself when top-level), with the liked comment pinned/highlighted.
    const newsId =
      typeof comment.news === "string" ? comment.news : comment.news?.id;
    const parentId =
      typeof comment.parent === "string" ? comment.parent : comment.parent?.id;
    const url = newsId
      ? await getCommentThreadUrl({
          payload,
          req,
          newsId,
          rootCommentId: parentId ?? input.commentId,
          highlightCommentId: input.commentId,
        })
      : null;

    await payload.create({
      collection: "notifications",
      data: {
        title: "New like on your comment",
        body: `${likerUsername} liked your comment`,
        type: "comment",
        deliveryAction: "send-now",
        targetType: "specific",
        specificUsers: [authorId],
        deviceTypes: ["all"],
        priority: "default",
        sound: true,
        _status: "published",
        data: { commentId: input.commentId, newsId, kind: "like", url },
      },
      req,
    });

    return { output: { sent: true } };
  },
} as TaskConfig<"sendCommentLikeNotification">;
