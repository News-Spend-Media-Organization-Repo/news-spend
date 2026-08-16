import type { BasePayload } from "payload";

/**
 * Tell everyone who entered that the draw has been made.
 *
 * Sent to every valid ticket holder, not only the winners, because that is the
 * audience the reveal itself has — `giveaway.lastResult` answers for people who
 * did not win too, and a draw that only speaks to winners reads to everyone
 * else as though their entry was never counted.
 *
 * DELIBERATELY SAYS NOTHING ABOUT THE OUTCOME. The reveal opens with a sealed
 * card and the result is shown after an advertisement; a notification reading
 * "you won!" would give that away on the lock screen and leave the sealed card
 * with nothing to reveal. "The draw has been made" is the whole message, and
 * the app decides how to break the news.
 *
 * It also matters beyond suspense: a prize goes unclaimed after fourteen days
 * or when the next giveaway starts, so somebody who never opens the app can
 * lose a prize they really won. This is the nudge that stops that being silent.
 *
 * NEVER THROWS. It runs after a draw has already awarded its prizes, and §21's
 * reasoning about the Winner Report applies just as much here: an unreachable
 * notification service must not turn a correct draw into a failed one.
 */
export async function notifyDrawCompleted(
  payload: BasePayload,
  giveawayId: string
): Promise<{ notified: number; reason?: string }> {
  try {
    const giveaway = await payload.findByID({
      collection: "giveaways",
      id: giveawayId,
      depth: 0,
    });

    const tickets = await payload.find({
      collection: "giveaway-tickets",
      where: {
        and: [
          { giveaway: { equals: giveawayId } },
          { status: { equals: "valid" } },
        ],
      },
      pagination: false,
      depth: 0,
    });

    // One notification per person, however many tickets they bought.
    const userIds = [
      ...new Set(
        tickets.docs
          .map((ticket) =>
            typeof ticket.user === "string"
              ? ticket.user
              : (ticket.user as { id?: string } | null)?.id
          )
          .filter((id): id is string => Boolean(id))
      ),
    ];

    if (userIds.length === 0) {
      return { notified: 0, reason: "no participants" };
    }

    await payload.create({
      collection: "notifications",
      data: {
        specificUsers: userIds,
        title: `${giveaway?.name ?? "The giveaway"} has been drawn`,
        body: "Open the app to see how it went.",
        priority: "high",
        sound: true,
        data: {
          giveawayId,
          type: "giveaway",
          url: "discover",
        },
      },
    });

    return { notified: userIds.length };
  } catch (error) {
    payload.logger.error(
      { err: error, giveawayId },
      "[giveaway] could not notify participants that the draw completed"
    );
    return { notified: 0, reason: "error" };
  }
}
