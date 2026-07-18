import type { CollectionAfterChangeHook } from "payload";

const LIKE_NOTIFICATION_DEBOUNCE_MS = 30 * 60 * 1000; // 30 minutes

type ReactionDoc = {
  id: string | number;
  type?: "like" | "dislike" | "none" | null;
  user?: string | { id?: string } | null;
  target?: {
    relationTo?: string;
    value?: string | { id?: string } | null;
  } | null;
};

/**
 * Schedules a debounced push notification to a comment's author when their
 * comment receives a new like. Fires only on the transition INTO "like" (a
 * fresh like, or switching from dislike/none) — not on every save, and not
 * on unlike (that's a delete, handled by afterDelete, which this hook
 * doesn't run for).
 *
 * Debounced via the job queue: if a "sendCommentLikeNotification" job is
 * already pending for this comment, this no-ops — the pending job will pick
 * up the latest liker when it fires. Otherwise schedules one, so a burst of
 * likes on a popular comment collapses into a single push.
 */
const notifyOnCommentLike: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const reaction = doc as ReactionDoc;
  const previous = previousDoc as ReactionDoc | undefined;

  if (reaction.type !== "like" || previous?.type === "like") {
    return doc;
  }

  if (reaction.target?.relationTo !== "comments") {
    return doc;
  }

  const commentId =
    typeof reaction.target.value === "string"
      ? reaction.target.value
      : reaction.target.value?.id;
  const actorId =
    typeof reaction.user === "string" ? reaction.user : reaction.user?.id;

  if (!(commentId && actorId)) {
    return doc;
  }

  try {
    const comment = await req.payload.findByID({
      collection: "comments",
      id: commentId,
      depth: 0,
      req,
    });

    const authorId =
      typeof comment?.user === "string" ? comment.user : comment?.user?.id;

    if (!authorId || authorId === actorId) {
      return doc;
    }

    const pending = await req.payload.find({
      collection: "payload-jobs",
      where: {
        taskSlug: { equals: "sendCommentLikeNotification" },
        "input.commentId": { equals: commentId },
        completedAt: { exists: false },
        hasError: { not_equals: true },
      },
      limit: 1,
      depth: 0,
      req,
    });

    if (pending.docs.length > 0) {
      return doc;
    }

    const author = await req.payload.findByID({
      collection: "users",
      id: authorId,
      depth: 0,
      req,
    });

    if (!author?.notificationPreferences?.types?.COMMENT) {
      return doc;
    }

    await req.payload.jobs.queue({
      task: "sendCommentLikeNotification",
      input: { commentId },
      waitUntil: new Date(Date.now() + LIKE_NOTIFICATION_DEBOUNCE_MS),
    });
  } catch (error) {
    req.payload.logger.error(
      { error, commentId, actorId },
      "notifyOnCommentLike: failed to schedule notification"
    );
  }

  return doc;
};

export default notifyOnCommentLike;
