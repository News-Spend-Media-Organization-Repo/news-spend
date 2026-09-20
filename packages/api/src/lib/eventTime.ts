/**
 * How far behind the server an event's own clock may put it.
 *
 * The app queues events while offline and sends them later, so a lag of days
 * is real. Beyond this the device's clock is more likely wrong than the queue
 * is that old, and an event dated months back would land in a chart nobody is
 * looking at.
 */
export const MAX_EVENT_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * How far ahead of the server an event's own clock may put it. A phone's clock
 * runs a little fast or slow; a minute or two is drift, hours is a wrong clock
 * or a forged value.
 */
export const MAX_EVENT_SKEW_MS = 5 * 60 * 1000;

/**
 * The time to record for an event: the device's own timestamp, held inside the
 * window the server is willing to believe.
 *
 * The device's time is kept, rather than replaced by the arrival time, because
 * it is when the reader actually did the thing, and a batch that sat in the
 * queue on a train for an hour should not count as happening at the next stop.
 * But it is a claim, so it is clamped, never trusted: an unparseable value is
 * the arrival time, a future one is no later than a little ahead of arrival,
 * and an old one is no older than the window.
 *
 * The arrival time is stored separately as `received_at`, so the unclamped
 * truth about when a row reached the server is never lost.
 */
export function clampEventTime(
  claimed: string | undefined,
  receivedAt: Date
): Date {
  if (claimed === undefined) {
    return receivedAt;
  }

  const claimedMs = Date.parse(claimed);
  if (Number.isNaN(claimedMs)) {
    return receivedAt;
  }

  const earliest = receivedAt.getTime() - MAX_EVENT_AGE_MS;
  const latest = receivedAt.getTime() + MAX_EVENT_SKEW_MS;
  return new Date(Math.min(Math.max(claimedMs, earliest), latest));
}
