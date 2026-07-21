import type { CollectionAfterChangeHook } from "payload";

/**
 * Schedules a daily moderation digest (11 PM Africa/Lagos). When a new
 * ContentReport is created, this checks if a digest job is already pending for
 * today. If not, it queues one with a waitUntil of the next 23:00. All reports
 * created during the day are batched into a single email sent to all admins.
 */
export const notifyAdminsOnReport: CollectionAfterChangeHook = async ({
  operation,
  req,
}) => {
  if (operation !== "create") {
    return;
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

    // Schedule for the next occurrence of 23:00 Africa/Lagos
    const now = new Date();
    const target = new Date(
      now.toLocaleString("en-US", { timeZone: "Africa/Lagos" })
    );
    target.setHours(23, 0, 0, 0);

    // If we're past 23:00 today, schedule for tomorrow
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    await req.payload.jobs.queue({
      task: "sendModerationDigest",
      input: {},
      waitUntil: target,
    });
  } catch (error) {
    req.payload.logger.error(
      { error },
      "Failed to schedule moderation digest job"
    );
  }
};
