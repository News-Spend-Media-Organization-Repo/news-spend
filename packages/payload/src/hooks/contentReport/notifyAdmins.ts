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

    // Schedule for the next occurrence of 23:00 Africa/Lagos.
    // Africa/Lagos is UTC+1 (no DST), so 23:00 Lagos equals 22:00 UTC.
    const now = new Date();
    const lagosParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const getPart = (type: "year" | "month" | "day") =>
      Number(lagosParts.find((part) => part.type === type)?.value ?? "0");
    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    let targetTimestamp = Date.UTC(year, month - 1, day, 22, 0, 0, 0);

    if (targetTimestamp <= now.getTime()) {
      targetTimestamp += 24 * 60 * 60 * 1000;
    }

    const target = new Date(targetTimestamp);

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
