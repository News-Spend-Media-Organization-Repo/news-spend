import {
  enum_partner_content_ad_size,
  enum_partner_content_placements,
  enum_partner_content_status,
  enum_partner_content_type,
} from "@news-spend-media/payload/payload-generated-schema";
import type { SelectType, TransformCollectionWithSelect, Where } from "payload";
import z from "zod";

import { publicProcedure } from "../index";

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
});

const byIdInput = z.object({ id: z.string() });

export const allPartnerContent = publicProcedure.handler(async ({ context }) => {
  const { payload } = context;
  const result = await payload.find({
    collection: "partner-content",
    pagination: false,
  });
  return result.docs;
});

export const partnerContentById = publicProcedure
  .input(byIdInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const result = await payload.findByID({
      collection: "partner-content",
      id: input.id,
    });
    if (!result) {
      throw new Error(`Partner content with id ${input.id} not found`);
    }
    return result;
  });

export const filteredPartnerContent = publicProcedure
  .input(FilteredInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const where: Where = {};
    if (input.placement && input.placement.length > 0) {
      where.placements = { in: input.placement };
    }
    if (input.status) {
      where.status = { equals: input.status };
    }

    if (input.type && input.type.length > 0) {
      where.type = { in: input.type };
    }
    if (input.adSize) {
      where.adSize = { equals: input.adSize };
    }

    const result = await payload.find({
      collection: "partner-content",
      where,
      limit: input.limit ?? 10,
      page: input.page ?? 1,
    });
    return result;
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

    const result = await payload.find({
      collection: "partner-content",
      where,
      pagination: false,
      depth: 2,
    });
    let finalResult: TransformCollectionWithSelect<"partner-content", SelectType> | null = null;
    if (result.docs.length > 0) {
      const randomIndex = Math.floor(Math.random() * result.docs.length);
      finalResult = result.docs[randomIndex] ?? null;
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

    const maxOffset = Math.max(0, totalDocs - limit);
    const randomOffset = Math.floor(Math.random() * maxOffset);

    const result = await payload.find({
      collection: "partner-content",
      where,
      limit,
      page: randomOffset + 1,
      depth: 2,
    });

    return result.docs.sort(() => Math.random() - 0.5);
  });

export const partnerContentRouter = {
  all: allPartnerContent,
  byId: partnerContentById,
  filtered: filteredPartnerContent,
  getOne: getOnePartnerContent,
  random: randomPartnerContent,
};
