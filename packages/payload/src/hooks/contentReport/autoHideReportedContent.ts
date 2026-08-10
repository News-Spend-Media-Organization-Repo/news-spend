import type { CollectionAfterChangeHook } from "payload";

/**
 * Number of distinct reporters required before a comment is hidden pending
 * moderator review. Distinct reporters — not raw report count — so one user
 * cannot bury a comment on their own.
 */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;

/**
 * Reasons severe enough to hide on a single report. Waiting for a third
 * reporter is not defensible for this category of content.
 */
const HIDE_ON_FIRST_REPORT = new Set([
  "illegal",
  "hate-speech",
  "inappropriate",
]);

/**
 * Hides reported comments automatically so objectionable content stops being
 * served without waiting for a moderator. Required by App Store Review
 * guideline 1.2, which expects reported content to be acted on promptly —
 * a human-in-the-loop-only flow cannot guarantee that.
 *
 * Hiding is reversible: a moderator sets `moderationStatus` back to "visible".
 */
export const autoHideReportedContent: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== "create") {
    return;
  }

  const reportedItem = (
    doc as { reportedItem?: { relationTo?: string; value?: unknown } | null }
  ).reportedItem;

  if (reportedItem?.relationTo !== "comments" || !reportedItem.value) {
    return;
  }

  const commentId =
    typeof reportedItem.value === "object"
      ? (reportedItem.value as { id?: string }).id
      : (reportedItem.value as string);

  if (!commentId) {
    return;
  }

  const reason = (doc as { reason?: string }).reason;

  try {
    const comment = await req.payload.findByID({
      collection: "comments",
      id: commentId,
      depth: 0,
      req,
    });

    // Only escalate content that is currently public. NULL counts as public:
    // comments created before this field existed have no value, and they must
    // stay auto-hideable. Anything already hidden or removed is left alone so
    // a moderator's decision is never overwritten.
    const status = comment?.moderationStatus;
    if (status === "hidden" || status === "removed") {
      return;
    }

    let shouldHide = reason ? HIDE_ON_FIRST_REPORT.has(reason) : false;

    if (!shouldHide) {
      const reports = await req.payload.find({
        collection: "contentReports",
        where: {
          "reportedItem.value": { equals: commentId },
          "reportedItem.relationTo": { equals: "comments" },
          status: { not_equals: "dismissed" },
        },
        depth: 0,
        pagination: false,
        req,
      });

      const distinctReporters = new Set(
        reports.docs
          .map((report) => {
            const reportedBy = (report as { reportedBy?: unknown }).reportedBy;
            return typeof reportedBy === "object" && reportedBy !== null
              ? (reportedBy as { id?: string }).id
              : (reportedBy as string | undefined);
          })
          .filter(Boolean)
      );

      shouldHide = distinctReporters.size >= AUTO_HIDE_REPORT_THRESHOLD;
    }

    if (!shouldHide) {
      return;
    }

    await req.payload.update({
      collection: "comments",
      id: commentId,
      data: { moderationStatus: "hidden" },
      req,
    });

    req.payload.logger.warn(
      {
        commentId,
        reason,
        trigger:
          reason && HIDE_ON_FIRST_REPORT.has(reason)
            ? "severe-reason"
            : "report-threshold",
      },
      "Comment auto-hidden pending moderator review"
    );
  } catch (error) {
    // Never fail the user's report because moderation bookkeeping failed.
    req.payload.logger.error(
      { error, commentId },
      "Failed to auto-hide reported comment"
    );
  }
};
