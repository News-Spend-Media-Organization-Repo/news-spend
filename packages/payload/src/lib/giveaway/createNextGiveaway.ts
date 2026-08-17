import type { BasePayload } from "payload";

/**
 * Open the next giveaway once the previous one has been drawn.
 *
 * The lottery created its next round on a fixed fortnightly calendar. This
 * chains off completion instead: a giveaway's window is set per giveaway, so
 * there is no calendar to anchor to, and the meaningful moment is "the last one
 * finished" rather than "it is Monday".
 *
 * IT COPIES THE PRIZE POOL FORWARD, and that is the whole reason this is safe
 * to automate. An empty giveaway would be worse than none — it would take the
 * single `active` slot and sell tickets for prizes nobody had chosen. Inheriting
 * the pool an administrator already configured means the new one is drawable
 * from the moment it opens.
 *
 * NEVER THROWS. It runs at the end of the scheduled task, after a draw has
 * already awarded its prizes. Failing to open the next giveaway is a gap an
 * administrator can close by hand; failing the task would also lose the
 * fulfilment and report work that ran alongside it.
 */
export async function createNextGiveaway(
  payload: BasePayload
): Promise<{ created: false; reason: string } | { created: true; id: string }> {
  try {
    // Only one giveaway may be active at a time (§3), and the collection
    // enforces it. Checking first keeps this a no-op rather than a caught
    // validation error on every sweep.
    const active = await payload.find({
      collection: "giveaways",
      where: { status: { equals: "active" } },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (active.docs[0]) {
      return { created: false, reason: "a giveaway is already running" };
    }

    const completed = await payload.find({
      collection: "giveaways",
      where: {
        and: [
          { status: { equals: "completed" } },
          { drawCompletedAt: { exists: true } },
        ],
      },
      sort: "-drawCompletedAt",
      limit: 1,
      pagination: false,
      depth: 0,
    });

    const previous = completed.docs[0];
    if (!previous) {
      return { created: false, reason: "nothing has been drawn yet" };
    }

    /**
     * Anything created after the last draw finished counts as its successor,
     * however it got there — including one an administrator made by hand, and
     * one they subsequently cancelled. A cancellation is a decision to stop,
     * so re-opening a giveaway on the next sweep would override it hourly.
     */
    const successor = await payload.find({
      collection: "giveaways",
      where: { createdAt: { greater_than: previous.drawCompletedAt } },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (successor.docs[0]) {
      return { created: false, reason: "a successor already exists" };
    }

    const prizeRows = await payload.find({
      collection: "giveaway-prizes",
      where: { giveaway: { equals: previous.id } },
      pagination: false,
      depth: 0,
    });

    if (prizeRows.docs.length === 0) {
      return { created: false, reason: "the previous giveaway had no prizes" };
    }

    // The same length of window as the one before it, so the cadence an
    // administrator chose carries forward instead of being invented here.
    const previousStart = new Date(previous.startDate as string).getTime();
    const previousEnd = new Date(previous.endDate as string).getTime();
    const duration = Math.max(previousEnd - previousStart, 24 * 3_600_000);

    const start = new Date();
    const end = new Date(start.getTime() + duration);

    const created = await payload.create({
      collection: "giveaways",
      data: {
        // `name` is unique, so the timestamp is what stops a second sweep
        // colliding with the first if both somehow get this far.
        name: `Giveaway ${start.toISOString().slice(0, 10)} ${start.getTime()}`,
        status: "active",
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        ticketPrice: previous.ticketPrice,
        minTicketsRequired: previous.minTicketsRequired,
        tier1WinnerPercentage: previous.tier1WinnerPercentage,
        tier2WinnerPercentage: previous.tier2WinnerPercentage,
        tier3WinnerPercentage: previous.tier3WinnerPercentage,
        budgetUtilizationPct: previous.budgetUtilizationPct,
        maxBudgetCapNaira: previous.maxBudgetCapNaira,
      },
    });

    for (const row of prizeRows.docs) {
      const prizeId =
        typeof row.prize === "string"
          ? row.prize
          : (row.prize as { id?: string } | null)?.id;

      // A pool row whose catalogue entry has gone is not worth carrying, and
      // the collection would refuse it anyway.
      if (!prizeId) {
        continue;
      }

      await payload.create({
        collection: "giveaway-prizes",
        data: {
          giveaway: created.id,
          prize: prizeId,
          tier: row.tier,
          maxUnits: row.maxUnits,
          // Stock is per giveaway: the units the last draw awarded are spent,
          // and this one starts from its own full allowance.
          unitsAwarded: 0,
        },
      });
    }

    payload.logger.info(
      `[giveaway] opened ${created.name} following ${previous.name}, ${prizeRows.docs.length} prize row(s) carried over`
    );

    return { created: true, id: String(created.id) };
  } catch (error) {
    payload.logger.error(
      { err: error },
      "[giveaway] could not open the next giveaway"
    );
    return { created: false, reason: "error" };
  }
}
