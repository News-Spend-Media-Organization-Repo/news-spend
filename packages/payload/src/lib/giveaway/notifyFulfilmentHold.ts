import type { BasePayload } from "payload";

import { resolveModerationRecipients } from "../moderationRecipients";
import { fulfilmentHoldEmail } from "./fulfilmentHoldEmail";

/**
 * Tell the admins that a payout needs a person.
 *
 * `hold()` already tells the winner, and deliberately vaguely, because the
 * provider's wording reads to a winner as gibberish. The administrator is the
 * one who can act on that wording, and until this existed nobody was told a
 * human was needed at all: two October winners' airtime failed, their prizes
 * were parked, and the problem sat unnoticed from the 9th until someone
 * complained.
 *
 * NEVER THROWS, for the same reason its winner-facing counterpart does not: the
 * prize is already held, and a mail server being unreachable must not turn a
 * handled hold into an unhandled failure.
 */
export async function notifyFulfilmentHold(
  payload: BasePayload,
  winnerId: string,
  reason: string
): Promise<{ notified: boolean }> {
  try {
    // The same resolution every other moderation alert uses, so an admin who
    // opted into urgent mail is not silently missed by this second audience.
    const recipients = await resolveModerationRecipients(payload, "urgent");

    if (recipients.length === 0) {
      return { notified: false };
    }

    /**
     * Both reads are optional and each is allowed to fail on its own. The
     * no-phone hold writes its attempt row only *after* `hold()` returns, so a
     * missing row is normal, not an error, and it merely omits the amount and
     * reference rather than blocking the email that says a prize is held.
     */
    const [winner, attempts] = await Promise.all([
      payload
        .findByID({ collection: "giveaway-winners", id: winnerId, depth: 0 })
        .catch(() => null),
      payload
        .find({
          collection: "giveaway-fulfilment-attempts",
          where: { winner: { equals: winnerId } },
          sort: "-attemptedAt",
          limit: 1,
          depth: 0,
        })
        .catch(() => null),
    ]);

    const attempt = attempts?.docs?.[0];

    const serverUrl =
      process.env.PAYLOAD_PUBLIC_SERVER_URL ?? process.env.APP_URL ?? "";

    const { subject, html } = fulfilmentHoldEmail({
      winnerName: winner?.claimRecipientName ?? null,
      prizeName: winner?.prizeName ?? "A giveaway prize",
      amount: attempt?.localAmount ?? null,
      reason,
      attemptReference: attempt?.providerReference ?? null,
      adminUrl: `${serverUrl}/admin/collections/giveaway-winners/${winnerId}`,
    });

    // One email per recipient: an admin who was added to the list must not
    // become the reason the others' copy fails to arrive.
    for (const recipient of recipients) {
      await payload.sendEmail({ to: recipient, subject, html });
    }

    return { notified: true };
  } catch (error) {
    payload.logger.error(
      { err: error, winnerId },
      "[giveaway] could not email the admins about a held payout"
    );
    return { notified: false };
  }
}
