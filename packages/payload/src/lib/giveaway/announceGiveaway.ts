import type { PayloadRequest } from "payload";
import { GIVEAWAY_DESCRIPTION_MAX_LENGTH } from "../../collections/giveaway/constants";

/**
 * Cut `text` to at most `max` characters, ending on a word boundary with an
 * ellipsis. The field's own `maxLength` already refuses anything longer, so
 * this only matters for a description written before that limit existed.
 */
export function truncateForPush(
  text: string,
  max = GIVEAWAY_DESCRIPTION_MAX_LENGTH
): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) {
    return clean;
  }
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/**
 * Push every user a notification that a giveaway has gone live, using its
 * description as the body.
 *
 * Sends nothing when the administrator has switched the announcement off
 * (`sendAnnouncement`, on by default) or the giveaway has no description. A
 * `{{firstName}}` in the description is filled in per recipient when the
 * notification is delivered.
 *
 * Queued as a scheduled notification for "now" instead of sent inline. Sending
 * inline would make the admin's Save wait on every device token, and the save
 * is the thing that has to succeed; the job queue picks it up on its next tick
 * and retries on failure.
 *
 * NEVER THROWS. The giveaway is already active by the time this runs, and a
 * notification problem must not turn a correct activation into a failed save.
 */
export async function announceGiveaway(
  giveaway: {
    id: string;
    name?: string | null;
    description?: string | null;
    sendAnnouncement?: boolean | null;
  },
  req: PayloadRequest
): Promise<{ queued: boolean; reason?: string }> {
  if (giveaway.sendAnnouncement === false) {
    return { queued: false, reason: "announcement switched off" };
  }

  const description = giveaway.description?.trim();
  if (!description) {
    return { queued: false, reason: "no description" };
  }

  try {
    await req.payload.create({
      collection: "notifications",
      data: {
        // `_status` matters: the collection has drafts enabled and the send
        // hook returns early on anything unpublished, so a draft never sends
        // and never errors.
        _status: "published",
        targetType: "all",
        title: "A new giveaway is live 🎁",
        body: truncateForPush(description),
        type: "promo",
        deliveryAction: "schedule",
        scheduledFor: new Date().toISOString(),
        scheduledFor_tz: "Africa/Lagos",
        priority: "high",
        sound: true,
        data: {
          giveawayId: giveaway.id,
          type: "giveaway",
          url: "play-lottery",
        },
      },
      req,
    });
    return { queued: true };
  } catch (error) {
    req.payload.logger.error(
      { err: error, giveawayId: giveaway.id },
      "[giveaway] could not queue the activation notification"
    );
    return { queued: false, reason: "error" };
  }
}
