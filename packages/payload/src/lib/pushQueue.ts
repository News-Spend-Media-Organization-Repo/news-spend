import type { PayloadRequest } from "payload";

/**
 * Sends a push without making the person who triggered it wait.
 *
 * Fanning a push out to every device (looking up tokens, sending to Expo in
 * batches, writing a delivery row and an inbox entry per device) takes as long
 * as the audience is large. Doing that inside a save made publishing an
 * article wait for it, and a slow or failing send could fail the save.
 *
 * Instead the send is queued as a job, in the same transaction as the
 * notification, so the job only becomes visible once the article is safely
 * saved. The runner is then started a few times shortly afterwards: the first
 * attempts may find nothing yet if the save is still committing, and a
 * per-minute runner on the API server (see `autoRun`) picks up anything the
 * nudges missed, so a send is delayed rather than lost. Only this queue is
 * run, so the CMS never picks up unrelated heavy jobs.
 *
 * Payload claims a job with a single conditional update, so two runners can
 * never take the same one.
 */
export const PUSH_QUEUE = "push";

/** When, after queueing, to start the runner. */
const NUDGE_DELAYS_MS = [1500, 5000, 15_000] as const;

/** How many queued sends one run will take. */
const RUN_LIMIT = 5;

export async function queueNotificationSend(
  req: PayloadRequest,
  notificationId: string,
  delaysMs: readonly number[] = NUDGE_DELAYS_MS
): Promise<void> {
  const { payload } = req;

  await payload.jobs.queue({
    task: "sendScheduledNotification",
    queue: PUSH_QUEUE,
    input: { notificationId },
    req,
  });

  for (const delay of delaysMs) {
    const timer = setTimeout(() => {
      payload.jobs
        .run({ queue: PUSH_QUEUE, limit: RUN_LIMIT })
        .catch((error: unknown) => {
          payload.logger.error({
            msg: "queueNotificationSend: could not start the push runner",
            err: error,
            notificationId,
          });
        });
    }, delay);
    // A pending nudge must never keep the process alive.
    timer.unref?.();
  }
}
