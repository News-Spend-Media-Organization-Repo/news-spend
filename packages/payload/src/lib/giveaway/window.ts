import type { BasePayload } from "payload";

import type { Giveaway } from "../../payload-types";

/**
 * Which giveaway is running, and whether it is open right now.
 *
 * Two questions that look like one and are not. "Which giveaway" is an
 * administrative answer: someone switched it on. "Is it open" is a question
 * about the clock, asked of the giveaway that was switched on.
 *
 * These live here, rather than beside the app-facing router that first needed
 * them, because they are now asked from two processes. The app asks before
 * taking a ticket or an engagement; the Google verification callback asks
 * before crediting a Boost, and arrives at the CMS rather than the API. Two
 * copies of "is it running" is precisely the drift this pair was written to
 * prevent.
 */

/**
 * The giveaway an administrator has switched on, if any.
 *
 * `active` is an administrative state, not a statement about the clock: a
 * giveaway is switched on once and then opens and closes on its own dates.
 * Every reader goes through here so that "which giveaway" is answered in one
 * place, and only then asks `giveawayWindow` whether it is open right now.
 */
export async function activeGiveaway(
  payload: BasePayload
): Promise<Giveaway | undefined> {
  const found = await payload.find({
    collection: "giveaways",
    where: { status: { equals: "active" } },
    limit: 1,
    pagination: false,
    depth: 0,
  });

  return found.docs[0];
}

export type GiveawayWindow =
  | { isOpen: true }
  | { isOpen: false; state: "pending" | "closed"; message: string };

/**
 * Whether the active giveaway is open for participation at this instant.
 *
 * The single source of truth for "is it running", shared by the write paths
 * that refuse participation and by `current`, which tells the app what to
 * render. They used to decide it separately, and the app would offer a live
 * "Enter Giveaway" button for a giveaway switched on ahead of its start date
 * while every purchase behind that button was refused.
 *
 * Compared as epoch milliseconds throughout. `startDate` and `endDate` are
 * stored and returned as UTC instants, so parsing them back to a `Date` and
 * taking `getTime()` is offset-safe wherever this runs; nothing here reads a
 * local calendar field.
 */
export function giveawayWindow(giveaway: Giveaway): GiveawayWindow {
  const now = Date.now();

  if (new Date(giveaway.startDate).getTime() > now) {
    return {
      isOpen: false,
      state: "pending",
      message: "This giveaway has not opened yet.",
    };
  }

  if (new Date(giveaway.endDate).getTime() <= now) {
    return {
      isOpen: false,
      state: "closed",
      message: "This giveaway has closed and is waiting for its draw.",
    };
  }

  return { isOpen: true };
}
