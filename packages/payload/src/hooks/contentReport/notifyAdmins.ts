import type { CollectionAfterChangeHook } from "payload";

import { URGENT_REASONS } from "../../lib/moderationLabels";
import { nextDigestTime } from "../../lib/nextDigestTime";

/**
 * Routes new ContentReports to admins on one of two tiers.
 *
 * Severe categories (see URGENT_REASONS) queue an immediate alert job, picked
 * up by the next default-queue autoRun tick. Everything else is batched into
 * the daily digest at 11 PM Africa/Lagos: when a digest job is already pending
 * this does nothing, otherwise it queues one with a waitUntil of the next
 * 23:00.
 */
export const notifyAdminsOnReport: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== "create") {
    return;
  }

  const reason = (doc as { reason?: string }).reason;
  const type = (doc as { type?: string }).type;

  // Filter rejections carry a severe-sounding reason but describe content that
  // was never published, so they must not page anyone. They still reach the
  // nightly digest below.
  if (reason && type !== "filterRejection" && URGENT_REASONS.has(reason)) {
    try {
      await req.payload.jobs.queue({
        task: "sendUrgentModerationAlert",
        input: { reportId: String((doc as { id: string | number }).id) },
      });
    } catch (error) {
      req.payload.logger.error(
        { error, reason },
        "Failed to queue urgent moderation alert"
      );
    }
    // Falls through to the digest as well, so the nightly summary stays a
    // complete record of the day rather than silently omitting severe reports.
  }

  try {
    const pending = await req.payload.find({
      collection: "payload-jobs",
      where: {
        taskSlug: { equals: "sendModerationDigest" },
        completedAt: { exists: false },
        hasError: { not_equals: true },
      },
      limit: 1,
      depth: 0,
      req,
    });

    if (pending.docs.length > 0) {
      return;
    }

    await req.payload.jobs.queue({
      task: "sendModerationDigest",
      input: {},
      waitUntil: nextDigestTime(),
    });
  } catch (error) {
    req.payload.logger.error(
      { error },
      "Failed to schedule moderation digest job"
    );
  }
};
