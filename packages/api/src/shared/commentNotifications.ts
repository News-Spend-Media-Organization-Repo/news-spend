import type { Context } from "../context";

const LIKE_NOTIFICATION_DEBOUNCE_MS = 30 * 60 * 1000;

type NotifyReplyParams = {
  recipientId: string;
  actorId: string;
  actorUsername: string;
  commentId: string;
  newsId: string;
  text: string;
};

/**
 * Sends an immediate push notification to the author of the comment being
 * replied to. No-ops if the recipient has comment notifications disabled, or
 * is replying to their own comment. Never throws — failures are logged and
 * swallowed so a notification issue can't break comment creation.
 */
export async function notifyCommentReply(
  ctx: Context,
  {
    recipientId,
    actorId,
    actorUsername,
    commentId,
    newsId,
    text,
  }: NotifyReplyParams
): Promise<void> {
  if (recipientId === actorId) {
    return;
  }

  try {
    const recipient = await ctx.payload.findByID({
      collection: "users",
      id: recipientId,
      depth: 0,
    });

    if (!recipient?.notificationPreferences?.types?.COMMENT) {
      return;
    }

    const preview = text.length > 140 ? `${text.slice(0, 140)}...` : text;

    await ctx.payload.create({
      collection: "notifications",
      data: {
        title: `${actorUsername} replied to your comment`,
        body: preview,
        type: "comment",
        deliveryAction: "send-now",
        targetType: "specific",
        specificUsers: [recipientId],
        deviceTypes: ["all"],
        priority: "high",
        sound: true,
        _status: "published",
        data: { commentId, newsId, kind: "reply" },
      },
    });
  } catch (error) {
    ctx.payload.logger.error(
      { error, commentId, recipientId },
      "notifyCommentReply: failed to create notification"
    );
  }
}

type ScheduleLikeParams = {
  commentId: string;
  authorId: string;
  actorId: string;
};

/**
 * Debounces like notifications for a comment: if a
 * "sendCommentLikeNotification" job is already pending for this comment,
 * this no-ops — the pending job will pick up the current like count/latest
 * liker when it fires. Otherwise schedules one after
 * LIKE_NOTIFICATION_DEBOUNCE_MS, so a burst of likes on a popular comment
 * collapses into a single push instead of one per like.
 */
export async function scheduleCommentLikeNotification(
  ctx: Context,
  { commentId, authorId, actorId }: ScheduleLikeParams
): Promise<void> {
  if (authorId === actorId) {
    return;
  }

  try {
    const pending = await ctx.payload.find({
      collection: "payload-jobs",
      where: {
        taskSlug: { equals: "sendCommentLikeNotification" },
        "input.commentId": { equals: commentId },
        completedAt: { exists: false },
        hasError: { not_equals: true },
      },
      limit: 1,
      depth: 0,
    });

    if (pending.docs.length > 0) {
      return;
    }

    const author = await ctx.payload.findByID({
      collection: "users",
      id: authorId,
      depth: 0,
    });

    if (!author?.notificationPreferences?.types?.COMMENT) {
      return;
    }

    await ctx.payload.jobs.queue({
      task: "sendCommentLikeNotification",
      input: { commentId },
      waitUntil: new Date(Date.now() + LIKE_NOTIFICATION_DEBOUNCE_MS),
    });
  } catch (error) {
    ctx.payload.logger.error(
      { error, commentId, authorId },
      "scheduleCommentLikeNotification: failed to schedule notification"
    );
  }
}
