import { randomUUID } from "node:crypto";
import { activityPoints } from "@news-spend-media/payload/lib/activityPoints";
import {
  canPayOnTap,
  isOfferPlacement,
} from "@news-spend-media/payload/lib/earnPlacements";
import { recordFeaturedOffer } from "@news-spend-media/payload/lib/giveaway/featuredOffer";

import { enum_partner_content_placements } from "@news-spend-media/payload/payload-generated-schema";
import { openapi } from "@orpc/openapi";
import type { BasePayload } from "payload";
import z from "zod";

import { protectedNoGuestProcedure, publicProcedure } from "../index";
import { APP_VERSION_HEADER } from "../lib/appVersion";
import { claimConversion } from "../lib/claimConversion";
import { verifyPartnerSignature } from "../lib/partnerWebhookSignature";
import { recordPostback } from "../lib/postbackLog";
import { partnerWebhookRateLimitMiddleware } from "../lib/ratelimit";
import { hasSettledConversion } from "../lib/settledConversion";
import { MISSING_TAP_SURFACE, requireTapSurface } from "../lib/tapSurface";

// Input schema for tracking a click
const trackClickInput = z.object({
  partnerContentId: z.string(),
  /**
   * Optional caller-minted click id, so a client can put the id into the
   * outbound URL and report the click without waiting on this round trip.
   *
   * Safe to accept because `clickId` is `unique: true` with a DB index on
   * partner-conversions: replaying somebody else's id fails the constraint
   * and writes nothing, so it cannot hijack or overwrite their conversion.
   * The format is pinned so the value stays a recognisable click id.
   *
   * Omitted, one is generated here as before.
   */
  clickId: z
    .string()
    .regex(/^clk_[0-9a-f]{16}$/, "Invalid click id")
    .optional(),
  /**
   * Which surface the tap came from. Partner ads only pay points from offer
   * placements; a tap from the news feed or a click ad is just a click.
   */
  surface: z.enum(enum_partner_content_placements.enumValues).optional(),
});

// Track a click on CPA content
export const trackClick = protectedNoGuestProcedure
  .input(trackClickInput)
  .handler(async ({ input, context, errors }) => {
    const { payload, user } = context;

    // Get PartnerContent with partner info
    const content = await payload.findByID({
      collection: "partner-content",
      id: input.partnerContentId,
      depth: 1,
      disableErrors: true,
    });

    if (!content) {
      throw errors.NOT_FOUND({
        message: "Partner content not found",
      });
    }

    // Get partner ID from content
    if (!content.partner) {
      throw errors.BAD_REQUEST({
        message: "Partner content has no associated partner",
      });
    }
    const partnerId =
      typeof content.partner === "string"
        ? content.partner
        : content.partner.id;

    // Caller-minted when the client needed the id before this call returned.
    const clickId =
      input.clickId ?? `clk_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // A tap that names no surface is a surface that can never pay when the
    // owner has switched that on; otherwise it keeps its legacy null.
    const surface =
      input.surface ?? (requireTapSurface() ? MISSING_TAP_SURFACE : undefined);

    // The data for deciding when the legacy "no surface" behaviour can go: how
    // many taps still arrive without one, and from which app versions (null =
    // a build that predates the version header). Search the logs for
    // `tap_without_surface`. Deliberately carries no user or click id.
    if (input.surface === undefined) {
      payload.logger.info(
        {
          event: "tap_without_surface",
          appVersion: context.headers?.get(APP_VERSION_HEADER) ?? null,
          enforced: requireTapSurface(),
          partnerContentId: input.partnerContentId,
        },
        "[partner] tap arrived without a surface"
      );
    }

    // Create conversion record
    const created = await payload.create({
      collection: "partner-conversions",
      data: {
        user: user.id,
        partner: partnerId,
        content: input.partnerContentId,
        clickId,
        surface: surface ?? null,
        status: "clicked",
        pointsAwarded: 0,
        clickedAt: new Date().toISOString(),
      },
    });

    // Get redirect URL
    const partner = await payload.findByID({
      collection: "partners",
      id: partnerId,
      disableErrors: true,
    });

    const redirectUrl = content.links?.website || partner?.websiteUrl;

    /**
     * Settle the conversion here, for a partner who cannot post back yet.
     *
     * 8 counts completions rather than intentions, and a tap is only an
     * intention. That is why a Featured Offer normally waits for the
     * partner's confirmation. But a partner with no working postback will
     * never send one, so every offer of theirs is uncompletable, and Tier 1
     * and Tier 2 are then unreachable for everybody: both require a Featured
     * Offer, and only Tier 1 has a waiver, after four barren draws.
     *
     * So this is a deliberate, temporary and NARROW relaxation: per partner,
     * off by default, and described in the CMS in terms of what it costs. Not
     * a global switch, because a global switch is the one nobody remembers to
     * turn off. This stops applying the moment that partner's record is
     * corrected.
     *
     * Never throws. The person has tapped a link and is waiting on a
     * redirect; a bookkeeping failure must not strand them on a spinner.
     */
    if (
      partner?.awardOnClick &&
      canPayOnTap({
        surface,
        placements: content.placements ?? [],
      })
    ) {
      try {
        /**
         * Once per person per offer, ever.
         *
         * `trackClick` deliberately records every tap (that is what click
         * tracking is), so nothing stops the same offer being opened fifty
         * times. Under a real postback that is harmless, because the partner
         * confirms one genuine action; with award-on-click there is no such
         * bound, and each tap would credit the points again.
         *
         * Points buy giveaway tickets, so an uncapped version of this is not
         * a points leak but an unlimited supply of draw entries. The Featured
         * Offer itself was already safe (`recordFeaturedOffer` refuses a
         * repeat), which is exactly why this gap would have been easy to miss:
         * eligibility looked correct while the points quietly multiplied.
         */
        const settled = await hasSettledConversion(payload, {
          userId: user.id,
          contentId: input.partnerContentId,
        });

        if (!settled) {
          const result = await settleConversion(payload, {
            conversion: created,
            content,
            partnerOrderId: `click:${clickId}`,
          });
          if (!result.claimed) {
            payload.logger.info(
              { clickId },
              "[partner] award-on-click refused: this offer was settled at the same moment"
            );
          }
        }
      } catch (error) {
        payload.logger.error(
          { err: error, clickId },
          "[partner] could not settle an award-on-click conversion"
        );
      }
    }

    return {
      clickId,
      redirectUrl,
      success: true,
    };
  });

// Webhook input schema
const webhookInput = z.object({
  clickId: z.string(),
  status: z.enum(["success", "failed"]),
  partnerOrderId: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  /**
   * Validate the request without settling anything.
   *
   * For a partner testing their own signing code against the real endpoint:
   * with this set, a valid signature is confirmed and nothing else happens —
   * no conversion is settled, no points are awarded, and no postback outcome
   * is recorded. Still requires a real `clickId` (there is no fake one to
   * hand out; using a partner's own recent test click is the intended way to
   * exercise this).
   */
  dryRun: z.boolean().optional(),
});

/**
 * Turn a click into a completed, paid-for conversion.
 *
 * One implementation for both ways a conversion can settle: a verified
 * partner postback, and the award-on-click relaxation for a partner who
 * cannot post back yet. They award the same points and record the same
 * Featured Offer because they mean the same thing; two copies would be two
 * things to keep in step.
 *
 * The conversion is claimed before anything is paid (see `claimConversion`):
 * the pre-checks callers run are only a cheap shortcut, and the claim is what
 * actually stops two simultaneous settlements for one person and offer both
 * paying. A refused claim pays nothing and reports `claimed: false`, so the
 * caller can answer it as the duplicate it is.
 *
 * Returns whether the claim was won, and the points credited (0 if refused).
 */
async function settleConversion(
  payload: BasePayload,
  {
    conversion,
    content,
    partnerOrderId,
  }: {
    conversion: Record<string, any>;
    content: Record<string, any> | null;
    partnerOrderId?: string;
  }
): Promise<{ claimed: boolean; points: number }> {
  const contentId =
    typeof conversion.content === "string"
      ? conversion.content
      : conversion.content?.id;
  const decidedPoints = activityPoints(content?.points);
  if (decidedPoints === null) {
    payload.logger.error(
      { contentId, points: content?.points },
      "Partner content points outside the allowed range"
    );
  }
  const pointsToAward = decidedPoints ?? 0;

  const userId =
    typeof conversion.user === "string" ? conversion.user : conversion.user?.id;

  if (contentId && userId) {
    const claimed = await claimConversion(payload, {
      conversionId: String(conversion.id),
      userId: String(userId),
      contentId: String(contentId),
      partnerOrderId,
    });
    if (!claimed) {
      return { claimed: false, points: 0 };
    }
  } else {
    // Nobody to pay, or no offer to be paid for once: record it and stop here,
    // so a payment can never happen without a successful claim.
    await payload.update({
      collection: "partner-conversions",
      id: conversion.id,
      data: {
        status: "converted",
        partnerOrderId,
        convertedAt: new Date().toISOString(),
      },
    });
    return { claimed: true, points: 0 };
  }

  if (pointsToAward > 0 && userId) {
    await payload.create({
      collection: "activities",
      data: {
        user: userId,
        type: "point",
        action: "partnerContentTask",
        point: pointsToAward,
        description: `Completed task: ${content?.title || "Partner task"}`,
      },
    });

    await payload.update({
      collection: "partner-conversions",
      id: conversion.id,
      data: {
        status: "awarded",
        pointsAwarded: pointsToAward,
        awardedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * A settled conversion on an app-wall item is a Featured Offer (8).
   *
   * Deliberately last and deliberately incapable of throwing: the points are
   * already credited, so a giveaway that is closed, or an offer already
   * counted, must not turn a settled conversion into a failure.
   */
  if (contentId && userId) {
    await recordFeaturedOffer(payload, { userId, contentId });
  }

  return { claimed: true, points: pointsToAward };
}

// Webhook for partner to confirm conversions
export const handleWebhook = publicProcedure
  .use(partnerWebhookRateLimitMiddleware)
  .meta(
    openapi({
      method: "POST",
      path: "/partner-conversions/webhook",
      tags: ["Partner Conversions"],
      summary: "Partner Conversion Webhook",
      description:
        "Webhook endpoint for partners to confirm CPA conversions. Call this when a user completes a task (install, purchase, etc.).",
    })
  )
  .input(webhookInput)
  .handler(async ({ input, context, errors }) => {
    const { payload } = context;

    // Find the conversion by clickId
    const conversions = await payload.find({
      collection: "partner-conversions",
      where: {
        clickId: { equals: input.clickId },
      },
      depth: 2,
      limit: 1,
    });

    const conversion = conversions.docs[0];
    if (!conversion) {
      throw errors.NOT_FOUND({
        message: "Click ID not found",
      });
    }

    /**
     * Prove the postback came from the partner before acting on it.
     *
     * The partner is identified by the click, not by anything the caller
     * says, so a forged request cannot choose whose secret it is checked
     * against. Verified before any write: the whole point is that an
     * unsigned call changes nothing.
     */
    const partnerRef = conversion.partner;
    const partnerDoc =
      typeof partnerRef === "object" && partnerRef !== null
        ? partnerRef
        : await payload
            .findByID({ collection: "partners", id: String(partnerRef) })
            .catch(() => null);

    // Which partner this postback is for, known because it names a real click.
    // Unresolvable (a partner since deleted) means there is nobody to record it
    // against, so it is not recorded.
    const partnerId =
      partnerDoc?.id !== undefined && partnerDoc?.id !== null
        ? String(partnerDoc.id)
        : undefined;

    const verdict = verifyPartnerSignature({
      headers: {
        signature: context.headers?.get("x-signature") ?? null,
        timestamp: context.headers?.get("x-timestamp") ?? null,
      },
      secret: String(partnerDoc?.webhookSecret ?? ""),
      clickId: input.clickId,
      status: input.status,
    });

    if (!verdict.valid) {
      payload.logger.warn(
        { clickId: input.clickId, reason: verdict.reason },
        "[partner] rejected an unverified conversion postback"
      );
      if (partnerId) {
        await recordPostback(payload, {
          partnerId,
          clickId: input.clickId,
          outcome: "rejected",
          reason: verdict.reason,
        });
      }
      // Deliberately not saying which check failed; that is a tuning guide
      // for anyone probing it. The partner's own logs have the detail.
      throw errors.UNAUTHORIZED({
        message: "This conversion could not be verified.",
      });
    }

    // A dry run only proves the signature is right. Stops here, deliberately
    // before the duplicate check and every write below: nothing about this
    // click's real state should change because a partner was testing their
    // signing code against it.
    if (input.dryRun) {
      return {
        success: true,
        clickId: input.clickId,
        dryRun: true as const,
        message: "Signature verified. No conversion was settled.",
      };
    }

    // Check if already converted
    if (conversion.status === "converted" || conversion.status === "awarded") {
      if (partnerId) {
        await recordPostback(payload, {
          partnerId,
          clickId: input.clickId,
          outcome: "duplicate",
        });
      }
      return {
        success: true,
        message: "Already processed",
        clickId: input.clickId,
      };
    }

    // Get content to determine points
    const contentId =
      typeof conversion.content === "string"
        ? conversion.content
        : conversion.content.id;

    const content = await payload.findByID({
      collection: "partner-content",
      id: contentId,
      disableErrors: true,
    });

    const conversionUserId =
      typeof conversion.user === "string"
        ? conversion.user
        : conversion.user?.id;

    if (input.status === "success") {
      /**
       * Partner ads pay from offer placements only. A conversion tapped on
       * any other surface (stored at click time) is acknowledged but neither
       * settled nor paid. Left `clicked` and unrecorded on purpose: the
       * postback outcome is a database enum, and this is not a new outcome
       * worth a migration. A missing surface is a click from before the
       * field existed; it follows the tap rule and settles only when the item
       * itself has an offer placement.
       */
      const placements = (content?.placements ?? []) as readonly string[];
      const fromNonOfferSurface = conversion.surface
        ? !isOfferPlacement(conversion.surface)
        : // Deleted content pays nothing either way; let it settle as before.
          Boolean(content) && !placements.some(isOfferPlacement);
      if (fromNonOfferSurface) {
        payload.logger.warn(
          { clickId: input.clickId, surface: conversion.surface ?? null },
          "[partner] ignored a postback for a conversion from a non-offer surface"
        );
        return {
          success: true,
          clickId: input.clickId,
          message: "Ignored: not an offer surface",
          pointsAwarded: 0,
        };
      }

      // One payout per person per offer, whichever click the partner confirms.
      if (
        conversionUserId &&
        (await hasSettledConversion(payload, {
          userId: conversionUserId,
          contentId,
        }))
      ) {
        if (partnerId) {
          await recordPostback(payload, {
            partnerId,
            clickId: input.clickId,
            outcome: "duplicate",
          });
        }
        return {
          success: true,
          message: "Already processed",
          clickId: input.clickId,
        };
      }
    }

    if (input.status !== "success") {
      await payload.update({
        collection: "partner-conversions",
        id: conversion.id,
        data: {
          status: "failed",
          partnerOrderId: input.partnerOrderId,
          convertedAt: new Date().toISOString(),
        },
      });

      if (partnerId) {
        await recordPostback(payload, {
          partnerId,
          clickId: input.clickId,
          outcome: "failed_reported",
        });
      }

      return {
        success: true,
        clickId: input.clickId,
        status: "failed" as const,
        pointsAwarded: 0,
      };
    }

    const settlement = await settleConversion(payload, {
      conversion,
      content,
      partnerOrderId: input.partnerOrderId,
    });

    // Lost a race with another settlement for the same person and offer that
    // the pre-check above could not see. Answered exactly like a duplicate.
    if (!settlement.claimed) {
      if (partnerId) {
        await recordPostback(payload, {
          partnerId,
          clickId: input.clickId,
          outcome: "duplicate",
        });
      }
      return {
        success: true,
        message: "Already processed",
        clickId: input.clickId,
      };
    }
    const pointsToAward = settlement.points;

    if (partnerId) {
      await recordPostback(payload, {
        partnerId,
        clickId: input.clickId,
        outcome: "accepted",
      });
    }

    return {
      success: true,
      clickId: input.clickId,
      status: "converted" as const,
      pointsAwarded: pointsToAward,
    };
  });

export const partnerConversionRouter = {
  trackClick,
  webhook: handleWebhook,
};
