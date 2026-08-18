import type { NewsSelect } from "@news-spend-media/payload/types";
import type { Payload, Where } from "payload";

/**
 * Builds a where clause for active partner content filtered by placements.
 * Ensures only partner content with status "active" and within valid
 * schedule dates (or no schedule) is returned.
 */
function buildPartnerContentWhere(placements: string[]): Where {
  const now = new Date().toISOString();
  return {
    placements: { in: placements },
    status: { equals: "active" },
    or: [
      { "schedule.startDate": { exists: false } },
      { "schedule.startDate": { less_than_equal: now } },
    ],
    and: [
      {
        or: [
          { "schedule.endDate": { exists: false } },
          { "schedule.endDate": { greater_than_equal: now } },
        ],
      },
    ],
  };
}

export type FetchMainNewsParams = {
  payload: Payload;
  type?: "article" | "video";
  category?: string;
  limit?: number;
  page?: number;
  depth?: number;
  sort?: string;
  select?: NewsSelect<false>;
};

export type FetchRelatedNewsParams = {
  payload: Payload;
  limit?: number;
  depth?: number;
  sort?: string;
  select?: NewsSelect<false>;
};

export type FetchPromotionMediaParams = {
  payload: Payload;
  limit?: number;
};

export type FetchPromoMediaParams = {
  payload: Payload;
  limit?: number;
};

export type FetchPartnerContentParams = {
  payload: Payload;
  placements: string[];
  limit?: number;
};

/** Fields to exclude from list/feed queries (heavy content not needed in cards) */
const LIST_VIEW_SELECT = { content: false, keyPoints: false } as const;

/**
 * Fetches main news items with filtering options
 */
export async function fetchMainNews(params: FetchMainNewsParams) {
  const {
    payload,
    type = "article",
    category,
    limit = 12,
    page = 1,
    depth = 1,
    sort = "-createdAt",
    select = LIST_VIEW_SELECT,
  } = params;

  const where: Where = {
    type: { equals: type },
    _status: { equals: "published" },
  };

  if (category) {
    where.category = { equals: category };
  }

  return await payload.find({
    collection: "news",
    where,
    depth,
    limit,
    sort,
    page,
    select,
  });
}

/**
 * Fetches related news from a random page for variety
 */
export async function fetchRelatedNews(params: FetchRelatedNewsParams) {
  const {
    payload,
    limit = 3,
    depth = 1,
    sort = "-createdAt",
    select = LIST_VIEW_SELECT,
  } = params;

  // Get total count to calculate random page
  const total = await payload.count({
    collection: "news",
    where: { _status: { equals: "published" } },
  });

  const totalPages = Math.max(Math.ceil(total.totalDocs / limit), 1);
  const randomPage = Math.floor(Math.random() * totalPages) + 1;

  return await payload.find({
    collection: "news",
    depth,
    limit,
    page: randomPage,
    sort,
    select,
    where: { _status: { equals: "published" } },
  });
}

/**
 * @deprecated Use fetchPromoMedia instead: queries partner-content with type=promo-media.
 * Keep until promotion-media data is migrated.
 */
export async function fetchPromotionMedia(params: FetchPromotionMediaParams) {
  const { payload, limit = 1 } = params;

  const promotionMediaCount = await payload.count({
    collection: "promotion-media",
  });

  const totalPages = Math.max(
    Math.ceil(promotionMediaCount.totalDocs / limit),
    1
  );
  const promotionMediaPage = Math.floor(Math.random() * totalPages) + 1;

  return await payload.find({
    collection: "promotion-media",
    pagination: false,
    limit,
    page: promotionMediaPage,
  });
}

/**
 * Fetches a random promo-media item from partner-content.
 */
export async function fetchPromoMedia(params: FetchPromoMediaParams) {
  const { payload, limit = 1 } = params;

  const where: Where = { type: { equals: "promo-media" } };

  const count = await payload.count({ collection: "partner-content", where });

  const totalPages = Math.max(Math.ceil(count.totalDocs / limit), 1);
  const randomPage = Math.floor(Math.random() * totalPages) + 1;

  return await payload.find({
    collection: "partner-content",
    where,
    limit,
    page: randomPage,
    pagination: false,
  });
}

/**
 * Fetches partner content for ads/tasks based on placement.
 * Only returns active content within valid schedule dates.
 */
export async function fetchPartnerContent(params: FetchPartnerContentParams) {
  const { payload, placements, limit = 1 } = params;
  const where = buildPartnerContentWhere(placements);

  const count = await payload.count({
    collection: "partner-content",
    where,
  });

  const totalPages = Math.max(Math.ceil(count.totalDocs / limit), 1);
  const randomPage = Math.floor(Math.random() * totalPages) + 1;

  return await payload.find({
    collection: "partner-content",
    where,
    page: randomPage,
    limit,
  });
}
