import {
  isEarnRequest,
  isOfferPlacement,
} from "@news-spend-media/payload/lib/earnPlacements";
import {
  enum_partner_content_ad_size,
  enum_partner_content_placements,
  enum_partner_content_status,
  enum_partner_content_type,
} from "@news-spend-media/payload/payload-generated-schema";
import type {
  BasePayload,
  SelectType,
  TransformCollectionWithSelect,
  Where,
} from "payload";
import z from "zod";

import { publicProcedure } from "../index";
import { shapeForPlacements } from "../lib/shapeForPlacements";

const PlacementEnum = z.enum(enum_partner_content_placements.enumValues);
const TypeEnum = z.enum(enum_partner_content_type.enumValues);
const AdSizeEnum = z.enum(enum_partner_content_ad_size.enumValues);
const StatusEnum = z.enum(enum_partner_content_status.enumValues);

const FilteredInput = z.object({
  placement: z.array(PlacementEnum).optional(),
  status: StatusEnum.optional(),
  type: z.array(TypeEnum).optional(),
  adSize: AdSizeEnum.optional(),
  limit: z.number().min(1).max(100).optional(),
  page: z.number().min(1).optional(),
  video: z.boolean().optional().default(false),
});

const GetOneInput = z.object({
  placement: z.array(PlacementEnum).optional(),
  type: z.array(TypeEnum).optional(),
  adSize: AdSizeEnum.optional(),
  video: z.boolean().optional().default(false),
  /**
   * Serving an advertisement whose Boost has already been earned.
   *
   * Selection is a uniform random pick over everything matching the
   * placement, which knows nothing about what this person has already done.
   * With a handful of Connect Brands items and a Boost cap of three, that
   * means repeats are not an edge case: after one Boost, one attempt in three
   * serves the same item back, and the person watches the whole advertisement
   * before `recordEngagement` refuses it as already completed.
   *
   * Set from the Boost surface so the exclusion applies where a repeat is
   * wasted effort, and nowhere else. The reveal plays an advertisement for
   * suspense, not for credit, and has no reason to narrow its inventory.
   */
  forBoost: z.boolean().optional().default(false),
});

const byIdInput = z.object({ id: z.string() });

export const allPartnerContent = publicProcedure.handler(
  async ({ context }) => {
    const { payload } = context;
    const result = await payload.find({
      collection: "partner-content",
      pagination: false,
    });
    return result.docs;
  }
);

export const partnerContentById = publicProcedure
  .input(byIdInput)
  .handler(async ({ input, context, errors }) => {
    const { payload } = context;
    const result = await payload.findByID({
      collection: "partner-content",
      id: input.id,
      disableErrors: true,
    });
    if (!result) {
      throw errors.NOT_FOUND({
        message: `Partner content with id ${input.id} not found`,
      });
    }
    return result;
  });

async function loadOfferState(payload: BasePayload, userId: string) {
  const settledIds = new Set<string>();
  const clickedIds = new Set<string>();
  // pagination: false is safe: bounded to one person's conversions, and
  // depth 0 keeps each row to ids.
  const conversions = await payload.find({
    collection: "partner-conversions",
    where: {
      and: [
        { user: { equals: userId } },
        { status: { in: ["clicked", "converted", "awarded"] } },
      ],
    },
    select: { content: true, status: true, surface: true },
    pagination: false,
    depth: 0,
  });

  for (const row of conversions.docs) {
    const contentId =
      typeof row.content === "string"
        ? row.content
        : (row.content as { id?: string } | null | undefined)?.id;
    if (!contentId) {
      continue;
    }
    if (row.status === "clicked") {
      // A tap on an ad surface can never pay, so it must not read as a
      // pending offer. Rows from before `surface` existed carry none.
      const surface = (row as { surface?: string | null }).surface;
      if (!surface || isOfferPlacement(surface)) {
        clickedIds.add(contentId);
      }
    } else {
      settledIds.add(contentId);
    }
  }
  return { settledIds, clickedIds };
}

export const filteredPartnerContent = publicProcedure
  .input(FilteredInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const where: Where = {};
    if (input.placement && input.placement.length > 0) {
      where.placements = { in: input.placement };
    }
    where.status = { equals: input.status ?? "active" };

    if (input.type && input.type.length > 0) {
      where.type = { in: input.type };
    }
    if (input.adSize) {
      where.adSize = { equals: input.adSize };
    }

    /**
     * Earn surfaces only, and only for a real account: hide offers this
     * person has already been paid for and mark the ones they have started.
     * Guests and ad surfaces see the catalogue unchanged, with no `userState`.
     */
    const user = context.user;
    const tracksUser =
      isEarnRequest(input.placement) && !!user && !user.isAnonymous;
    const { settledIds, clickedIds } =
      tracksUser && user
        ? await loadOfferState(payload, user.id)
        : { settledIds: new Set<string>(), clickedIds: new Set<string>() };
    if (settledIds.size > 0) {
      where.id = { not_in: [...settledIds] };
    }

    const result = await payload.find({
      collection: "partner-content",
      where,
      limit: input.limit ?? 10,
      page: input.page ?? 1,
    });
    return {
      ...result,
      docs: result.docs.map((doc) => {
        const shaped = shapeForPlacements(doc, input.placement);
        if (!tracksUser) {
          return shaped;
        }
        const userState: "available" | "pending" =
          clickedIds.has(String(doc.id)) && !settledIds.has(String(doc.id))
            ? "pending"
            : "available";
        return { ...shaped, userState };
      }),
    };
  });

export const getOnePartnerContent = publicProcedure
  .input(GetOneInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const where: Where = {
      status: { equals: "active" },
    };
    if (input.placement && input.placement.length > 0) {
      where.placements = { in: input.placement };
    }
    if (input.type && input.type.length > 0) {
      where.type = { in: input.type };
    }
    if (input.adSize) {
      where.adSize = { equals: input.adSize };
    }

    /**
     * Drop anything this person has already earned a Boost from in the open
     * giveaway. Done here rather than in the app because it is the same rule
     * `recordEngagement` enforces, and a client-side version could only ever
     * be a second, drifting copy of it.
     *
     * Silent when there is no open giveaway or nobody signed in: this is a
     * refinement of which advertisement to show, never a reason not to show
     * one.
     */
    if (input.forBoost && context.user) {
      const open = await payload.find({
        collection: "giveaways",
        where: { status: { equals: "active" } },
        limit: 1,
        pagination: false,
        depth: 0,
      });

      const giveawayId = open.docs[0]?.id;
      if (giveawayId) {
        const done = await payload.find({
          collection: "giveaway-engagements",
          where: {
            and: [
              { giveaway: { equals: giveawayId } },
              { user: { equals: context.user.id } },
              { type: { equals: "boost" } },
              { completionStatus: { equals: "completed" } },
            ],
          },
          pagination: false,
          depth: 0,
        });

        const spent = done.docs
          .map((row) =>
            typeof row.content === "string"
              ? row.content
              : String((row.content as { id?: string } | null)?.id)
          )
          .filter(Boolean);

        if (spent.length > 0) {
          where.id = { not_in: spent };
        }
      }
    }

    const result = await payload.find({
      collection: "partner-content",
      where,
      pagination: false,
      depth: 2,
    });
    let finalResult: TransformCollectionWithSelect<
      "partner-content",
      SelectType
    > | null = null;
    if (result.docs.length > 0) {
      const randomIndex = Math.floor(Math.random() * result.docs.length);
      const picked = result.docs[randomIndex];
      finalResult = picked ? shapeForPlacements(picked, input.placement) : null;
    }
    return finalResult;
  });

const RandomInput = z.object({
  placement: z.array(PlacementEnum).optional(),
  status: StatusEnum.optional(),
  type: z.array(TypeEnum).optional(),
  adSize: AdSizeEnum.optional(),
  limit: z.number().min(1).max(100).optional(),
});

export const randomPartnerContent = publicProcedure
  .input(RandomInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;

    const where: Where = {
      status: { equals: "active" },
    };

    if (input.placement && input.placement.length > 0) {
      where.placements = { in: input.placement };
    }

    if (input.type && input.type.length > 0) {
      where.type = { in: input.type };
    }

    if (input.adSize) {
      where.adSize = { equals: input.adSize };
    }

    const limit = input.limit ?? 10;

    const countResult = await payload.count({
      collection: "partner-content",
      where,
    });

    const totalDocs = countResult.totalDocs;

    if (totalDocs === 0) {
      return [];
    }

    // `page` counts windows of `limit`, not rows. A row offset here sent the
    // query past the end of the collection as soon as there was more than one
    // page of matches, so the surface rendered as if it had no content.
    const totalPages = Math.ceil(totalDocs / limit);
    const page = Math.floor(Math.random() * totalPages) + 1;

    const result = await payload.find({
      collection: "partner-content",
      where,
      limit,
      page,
      depth: 2,
    });

    return result.docs
      .map((doc) => shapeForPlacements(doc, input.placement))
      .sort(() => Math.random() - 0.5);
  });

export const partnerContentRouter = {
  all: allPartnerContent,
  byId: partnerContentById,
  filtered: filteredPartnerContent,
  getOne: getOnePartnerContent,
  random: randomPartnerContent,
};
