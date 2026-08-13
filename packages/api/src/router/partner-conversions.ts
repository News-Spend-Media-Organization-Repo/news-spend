import { randomUUID } from "node:crypto";

import { openapi } from "@orpc/openapi";
import z from "zod";

import { protectedNoGuestProcedure, publicProcedure } from "../index";

// Input schema for tracking a click
const trackClickInput = z.object({
  partnerContentId: z.string(),
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

    // Generate unique click ID
    const clickId = `clk_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // Create conversion record
    await payload.create({
      collection: "partner-conversions",
      data: {
        user: user.id,
        partner: partnerId,
        content: input.partnerContentId,
        clickId,
        status: "clicked",
        pointsAwarded: 0,
        clickedAt: new Date().toISOString(),
      },
    });

    // Get redirect URL
    const partner = await payload.findByID({
      collection: "partners",
      id: partnerId,
    });

    const redirectUrl = content.links?.website || partner?.websiteUrl;

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
});

// Webhook for partner to confirm conversions
export const handleWebhook = publicProcedure
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

    // Check if already converted
    if (conversion.status === "converted" || conversion.status === "awarded") {
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
    });

    const pointsToAward = content?.points || 0;

    // Update conversion status
    await payload.update({
      collection: "partner-conversions",
      id: conversion.id,
      data: {
        status: input.status === "success" ? "converted" : "failed",
        partnerOrderId: input.partnerOrderId,
        convertedAt: new Date().toISOString(),
      },
    });

    // If successful, award points
    if (input.status === "success" && pointsToAward > 0) {
      const userId =
        typeof conversion.user === "string"
          ? conversion.user
          : conversion.user.id;

      // Create activity for points
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

      // Update conversion to awarded
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

    return {
      success: true,
      clickId: input.clickId,
      status: input.status === "success" ? "converted" : "failed",
      pointsAwarded: input.status === "success" ? pointsToAward : 0,
    };
  });

export const partnerConversionRouter = {
  trackClick,
  webhook: handleWebhook,
};
