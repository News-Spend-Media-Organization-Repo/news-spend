import type { BasePayload, Where } from "payload";

import { MAX_GOOGLE_BOOSTS_PER_GIVEAWAY } from "../../collections/giveaway/constants";
import type { SsvCallback } from "./admobSsv";
import { activeGiveaway, giveawayWindow } from "./window";

/**
 * Crediting a Boost from a verified Google rewarded impression.
 *
 * Runs only after `verifySsvCallback` has accepted the signature, so the user
 * id and transaction id below are Google's account of what happened rather
 * than a caller's. Everything here is the part signature checking cannot
 * answer: whether this person was taking part at all, whether this impression
 * has already been spent, and whether they have had as many of these as a
 * giveaway allows.
 */

/**
 * The marker the app sets in `custom_data` on the Boost surface.
 *
 * Rewarded ads run on more than one screen, and a reward earned on the
 * giveaway reveal is entertainment rather than credit. Without this, every
 * rewarded impression anywhere in the app would arrive here indistinguishable
 * from a Boost and quietly mint one.
 */
export const BOOST_SSV_PURPOSE = "boost";

export type GoogleBoostOutcome =
  /** A Boost was created. */
  | { status: "recorded"; engagementId: string | number }
  /**
   * Understood and deliberately not credited. The callback was genuine, so
   * there is nothing for Google to retry.
   */
  | { status: "ignored"; reason: string }
  /**
   * Something on our side failed. Google should send it again rather than
   * drop a reward the user did earn.
   */
  | { status: "error"; reason: string };

function parsePurpose(customData: string | null): string | null {
  if (!customData) {
    return null;
  }
  try {
    const parsed = JSON.parse(customData) as { purpose?: unknown };
    return typeof parsed.purpose === "string" ? parsed.purpose : null;
  } catch {
    return null;
  }
}

export async function recordGoogleBoost(
  payload: BasePayload,
  callback: SsvCallback
): Promise<GoogleBoostOutcome> {
  if (parsePurpose(callback.customData) !== BOOST_SSV_PURPOSE) {
    return { status: "ignored", reason: "not_a_boost" };
  }

  try {
    const giveaway = await activeGiveaway(payload);
    if (!giveaway) {
      return { status: "ignored", reason: "no_active_giveaway" };
    }

    /*
     * The window matters as much here as on the app's own path. A rewarded ad
     * started seconds before a giveaway closed can verify seconds after, and
     * the candidate pool is built from what was true at the close: a Boost
     * written afterwards is a row that silently never counted.
     */
    if (!giveawayWindow(giveaway).isOpen) {
      return { status: "ignored", reason: "giveaway_not_open" };
    }

    /*
     * Checked before anything is written, so a replayed URL is cheap to
     * refuse. The unique index on `verificationId` is what actually
     * guarantees it — two copies of one callback arriving together both pass
     * this check, and the second loses at the insert.
     */
    const seen = await payload.find({
      collection: "giveaway-engagements",
      where: { verificationId: { equals: callback.transactionId } },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (seen.docs.length > 0) {
      return { status: "ignored", reason: "already_recorded" };
    }

    const scope: Where[] = [
      { giveaway: { equals: giveaway.id } },
      { user: { equals: callback.userId } },
    ];

    /*
     * The same rule the app's own Boost path enforces: engagement without
     * participation is not participation. A rewarded ad watched by somebody
     * holding no ticket earns nothing, and saying so here keeps the two paths
     * agreeing about what a Boost is worth.
     */
    const tickets = await payload.find({
      collection: "giveaway-tickets",
      where: { and: [...scope, { status: { equals: "valid" } }] },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (tickets.docs.length === 0) {
      return { status: "ignored", reason: "no_valid_ticket" };
    }

    const earned = await payload.count({
      collection: "giveaway-engagements",
      where: {
        and: [
          ...scope,
          { type: { equals: "boost" } },
          { source: { equals: "google" } },
          { completionStatus: { equals: "completed" } },
        ],
      },
    });

    if (earned.totalDocs >= MAX_GOOGLE_BOOSTS_PER_GIVEAWAY) {
      return { status: "ignored", reason: "google_boost_cap_reached" };
    }

    const engagement = await payload.create({
      collection: "giveaway-engagements",
      data: {
        giveaway: giveaway.id,
        user: callback.userId,
        type: "boost",
        source: "google",
        // No partner item: a Google impression has no record to attribute to.
        content: null,
        verificationId: callback.transactionId,
        completionStatus: "completed",
        completedAt: new Date().toISOString(),
        metadata: {
          adUnit: callback.adUnit,
          rewardItem: callback.rewardItem,
          rewardAmount: callback.rewardAmount,
          verifiedAt: new Date().toISOString(),
          googleTimestamp: callback.timestamp,
        },
      },
    });

    return { status: "recorded", engagementId: engagement.id };
  } catch (error) {
    /*
     * The unique index rejecting a concurrent duplicate is a success for our
     * purposes: one impression, one Boost, which is exactly what it is there
     * to enforce. Reporting it as an error would have Google retry a callback
     * that has already been honoured.
     */
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|duplicate/i.test(message)) {
      return { status: "ignored", reason: "already_recorded" };
    }

    return { status: "error", reason: message };
  }
}
