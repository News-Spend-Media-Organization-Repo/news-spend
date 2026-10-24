import { isOfferPlacement } from "@news-spend-media/payload/lib/earnPlacements";
import {
  activities,
  enum_activities_action,
} from "@news-spend-media/payload/payload-generated-schema";
import { eq, sum } from "@payloadcms/db-postgres/drizzle";
import type { Where } from "payload";
import z from "zod";

import { protectedNoGuestProcedure, protectedProcedure } from "../index";
import {
  effectiveConfirmationDays,
  type PendingOffer,
  pendingStateFor,
} from "../lib/pendingOffers";
import { ActivityCreateInput, addClientActivity } from "../shared/activity";

const ActivityByUserId = z.object({
  category: z
    .enum(["all", "shopping-and-purchase", "referrals", "reward-history"])
    .default("all"),
  startDate: z
    .string()
    .optional()
    .default(() => new Date().toISOString().substring(0, 10)),
  endDate: z
    .string()
    .optional()
    .default(() =>
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
    ),
  type: z.enum(["visited", "posted", "pending"]).default("visited"),
  page: z.number().nullish().default(1),
  limit: z.number().min(1).max(100).nullish().default(10),
});

const addActivity = protectedNoGuestProcedure
  .input(ActivityCreateInput)
  .handler(async ({ input, context }) => addClientActivity(input, context));

const totalPoints = protectedProcedure.handler(async ({ context }) => {
  const { user, payload } = context;
  const query = await payload.db.drizzle
    .select({
      totalPoints: sum(activities.point).mapWith(Number),
    })
    .from(activities)
    .where(eq(activities.user, user.id));

  return query[0]?.totalPoints ?? 0;
});

const byUserId = protectedProcedure
  .input(ActivityByUserId)
  .handler(async ({ input, context }) => {
    const { user, payload } = context;
    if (
      (input.category !== "all" && input.category !== "reward-history") ||
      input.type !== "posted"
    ) {
      return {
        docs: [],
        totalDocs: 0,
        limit: 10,
        page: 1,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
        prevPage: null,
        nextPage: null,
        pagingCounter: 0,
      };
    }
    const result = await payload.find({
      collection: "activities",
      where: {
        user: {
          equals: user.id,
        },
        ...(input.startDate && input.endDate
          ? {
              createdAt: {
                greater_than: input.startDate,
                less_than: input.endDate,
              },
            }
          : {}),
      },
      sort: "-createdAt",
      limit: input.limit || 10,
      page: input.page || 1,
    });

    return result;
  });

const byNewsId = protectedProcedure
  .input(
    z.object({
      newsId: z.string(),
      action: z.enum(enum_activities_action.enumValues).optional(),
    })
  )
  .handler(async ({ input, context }) => {
    const { user, payload } = context;
    const { newsId, action } = input;
    const where: Where = {
      news: {
        equals: newsId,
      },
      user: {
        equals: user.id,
      },
    };
    if (action) {
      where.action = {
        equals: action,
      };
    }
    const result = await payload.find({
      collection: "activities",
      where,
    });

    return result.docs;
  });

type Doc = {
  id: string | number;
  title?: string;
  companyName?: string;
  confirmationDays?: number | null;
  points?: number | null;
  placements?: readonly string[] | null;
};

const PENDING_OFFERS_LIMIT = 50;
const PENDING_SCAN_LIMIT = 500;

const relationId = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "id" in value) {
    const { id } = value as { id: unknown };
    return typeof id === "string" || typeof id === "number" ? String(id) : null;
  }
  return null;
};

/**
 * Offers the user tapped but has not been paid for yet. Read from
 * partner-conversions only; nothing is written to activities.
 */
const pendingOffers = protectedNoGuestProcedure.handler(
  async ({ context }): Promise<PendingOffer[]> => {
    const { user, payload } = context;
    const now = new Date();

    const settled = await payload.find({
      collection: "partner-conversions",
      where: {
        and: [
          { user: { equals: user.id } },
          { status: { in: ["converted", "awarded"] } },
        ],
      },
      depth: 0,
      limit: PENDING_SCAN_LIMIT,
      pagination: false,
    });
    const settledContent = new Set<string>();
    for (const doc of settled.docs) {
      const id = relationId(doc.content);
      if (id) {
        settledContent.add(id);
      }
    }

    const open = await payload.find({
      collection: "partner-conversions",
      where: {
        and: [
          { user: { equals: user.id } },
          { status: { in: ["clicked", "failed"] } },
        ],
      },
      sort: "-clickedAt",
      depth: 1,
      limit: PENDING_SCAN_LIMIT,
      pagination: false,
    });

    // depth 1 populates relationships; a plain id means it was not resolved,
    // so look those up once rather than treating them as deleted.
    const unresolved = (field: "partner" | "content") =>
      open.docs.flatMap((doc) =>
        typeof doc[field] === "string" ? [doc[field] as string] : []
      );
    const lookup = async (
      collection: "partners" | "partner-content",
      ids: string[]
    ) => {
      const unique = [...new Set(ids)];
      if (unique.length === 0) {
        return new Map<string, Doc>();
      }
      const found = await payload.find({
        collection,
        where: { id: { in: unique } },
        depth: 0,
        limit: unique.length,
        pagination: false,
      });
      return new Map<string, Doc>(found.docs.map((d) => [String(d.id), d]));
    };
    const partnersById = await lookup("partners", unresolved("partner"));
    const contentById = await lookup("partner-content", unresolved("content"));

    const seen = new Set<string>();
    const offers: PendingOffer[] = [];
    for (const doc of open.docs) {
      if (offers.length >= PENDING_OFFERS_LIMIT) {
        break;
      }
      const contentId = relationId(doc.content);
      // Docs are newest first, so the first sighting is the latest click.
      if (!contentId || seen.has(contentId)) {
        continue;
      }
      seen.add(contentId);
      if (settledContent.has(contentId)) {
        continue;
      }

      const content =
        doc.content && typeof doc.content === "object"
          ? doc.content
          : contentById.get(contentId);
      if (!content?.title) {
        continue;
      }
      /**
       * A tap on an ad surface can never pay, so it is not a pending offer.
       * Clicks from before `surface` existed carry none; they paid only when
       * the item had an offer placement, the same test `canPayOnTap` uses.
       */
      if (
        doc.surface
          ? !isOfferPlacement(doc.surface)
          : !(content.placements ?? []).some(isOfferPlacement)
      ) {
        continue;
      }
      const partnerId = relationId(doc.partner);
      const partner =
        doc.partner && typeof doc.partner === "object"
          ? doc.partner
          : partnerId
            ? partnersById.get(partnerId)
            : undefined;

      const state = pendingStateFor({
        status: doc.status,
        clickedAt: doc.clickedAt,
        convertedAt: doc.convertedAt,
        confirmationDays: partner?.confirmationDays,
        now,
      });
      if (state === "hidden") {
        continue;
      }

      offers.push({
        contentId,
        title: content.title,
        partnerName: partner?.companyName ?? null,
        state,
        expectedWithinDays: effectiveConfirmationDays(
          partner?.confirmationDays
        ),
        points: content.points ?? 0,
        clickedAt: doc.clickedAt,
      });
    }
    return offers;
  }
);

export const activityRouter = {
  add: addActivity,
  totalPoints,
  byUserId,
  byNewsId,
  pendingOffers,
};
