import { openapi } from "@orpc/openapi";
import type { Where } from "payload";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../..";
import { withCache } from "../../lib/cache";
import { createAdManager, DEFAULT_AD_CONFIG } from "./ad-manager";
import { newsAnalyticsRouter } from "./analytics";
import { getCommentCountForNews } from "./comment-counts";
import {
  fetchMainNews,
  fetchPromoMedia,
  fetchRelatedNews,
} from "./content-fetchers";
import {
  composeFeed,
  composeSimpleFeed,
  DEFAULT_FEED_CONFIG,
  type FeedComposerData,
} from "./feed-composer";
import { sanitizeContent } from "./sanitize-content";
import {
  getNewsReactionCounts,
  getUserReactionForNews,
  type UserReaction,
} from "./user-reaction";

// Input schemas
const HomeInputSchema = z.object({
  limit: z.number().min(1).max(100).nullish().default(10),
  page: z.number().nullish().default(1),
  /** Pull-to-refresh: bypass the composed-feed cache for this one call. */
  forceRefresh: z.boolean().nullish().default(false),
});

const AllInputSchema = z.object({
  limit: z.number().min(1).max(100).nullish().default(10),
  page: z.number().nullish().default(1),
  category: z.string().optional(),
  type: z.enum(["article", "video"]).optional().default("article"),
  includeAds: z.boolean().optional().default(true),
  /** Pull-to-refresh: bypass the composed-feed cache for this one call. */
  forceRefresh: z.boolean().nullish().default(false),
});

export type AllNewsInput = z.input<typeof AllInputSchema>;
export type HomeNewsInput = z.input<typeof HomeInputSchema>;

// Helper to build "where" clause
function buildWhere(input: AllNewsInput) {
  const where: Where = {
    type: { equals: input.type },
    _status: { equals: "published" },
  };
  if (input.category) {
    where.category = { equals: input.category };
  }
  return where;
}

const all = publicProcedure
  .input(AllInputSchema)
  .handler(({ input, context }) => {
    const { payload } = context;
    const limit = input.limit || 10;
    const page = input.page || 1;

    // Video news is switched off server-side (News collection offers only
    // "article"; the Postgres enum is ('article')). Old mobile builds still
    // request type=video — hitting Postgres with that value throws
    // `invalid input value for enum enum_news_type` (NEWSPEND-API-G) and
    // surfaces on mobile as MalformedResponseError. Short-circuit to an
    // empty page instead of querying.
    if (input.type === "video") {
      return {
        docs: [],
        totalDocs: 0,
        limit,
        page,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
        prevPage: null,
        nextPage: null,
        pagingCounter: 0,
      };
    }

    const where = buildWhere(input);

    const buildFeed = async () => {
      // Fetch news items (depth 1, exclude heavy fields for list views)
      const data = await payload.find({
        collection: "news",
        where,
        limit,
        page,
        depth: 1,
        select: { content: false, keyPoints: false },
      });

      // Only inject ads if input.includeAds is true (default: true)
      if (input.includeAds !== false) {
        // Create ad manager and compose simple feed with ads
        const adManager = await createAdManager(payload, DEFAULT_AD_CONFIG);
        const docsWithAds = composeSimpleFeed(data.docs, adManager, 4);

        return { ...data, docs: docsWithAds };
      }

      // If ads are not included, return plain news
      return data;
    };

    // Composed feed (article selection + which ad fills each slot) cached
    // 90s, same window as `home` — a passive refetch (tab switch, app
    // foreground, article-back) reuses the same ad slots instead of asking
    // Google for a fresh native ad every time. A deliberate pull-to-refresh
    // sets forceRefresh and always gets a genuinely fresh compose.
    return withCache(
      `news:all:${input.category ?? "*"}:${input.type}:${input.includeAds}:${page}:${limit}`,
      { forceRefresh: input.forceRefresh ?? false, ttl: 90 },
      buildFeed
    );
  });

/**
 * Editor-curated picks lead the carousel. Ranked lowest rank first;
 * unranked picks sit below ranked ones, newest first. Anything the app
 * shows here was chosen by a person, which is the whole point: at low
 * traffic the algorithmic ranking below is decided by single opens.
 */
async function curatedPicks(
  payload: any,
  limit: number
): Promise<{ picks: any[] }> {
  const res = await payload.find({
    collection: "news",
    where: {
      _status: { equals: "published" },
      featured: { equals: true },
    },
    depth: 1,
    limit: 20,
    pagination: false,
    select: { content: false, keyPoints: false },
  });
  const picks = [...res.docs].sort((a: any, b: any) => {
    const ra =
      typeof a.featuredRank === "number"
        ? a.featuredRank
        : Number.POSITIVE_INFINITY;
    const rb =
      typeof b.featuredRank === "number"
        ? b.featuredRank
        : Number.POSITIVE_INFINITY;
    if (ra !== rb) {
      return ra - rb;
    }
    return (
      new Date(b.publishedAt ?? b.createdAt).getTime() -
      new Date(a.publishedAt ?? a.createdAt).getTime()
    );
  });
  return { picks: picks.slice(0, limit) };
}

async function trendingFallback(
  payload: any,
  limit: number,
  excludeIds: string[]
): Promise<any[]> {
  let cachedResult: any[] | null = null;

  // try redis first
  try {
    const { getRedis } = await import("../../lib/redis");
    const r = getRedis();
    const cached = await r.get("trending:news");
    if (cached) {
      const parsed = JSON.parse(cached) as { id: string; score: number }[];
      // Grab a larger pool to account for unpublished/drafted items
      const candidateIds = parsed
        .slice(0, limit * 3 + excludeIds.length)
        .map((p) => p.id)
        .filter((id) => !excludeIds.includes(id));
      if (candidateIds.length) {
        const res = await payload.find({
          collection: "news",
          where: {
            id: { in: candidateIds },
            _status: { equals: "published" },
          },
          depth: 1,
          limit: candidateIds.length,
          pagination: false,
          select: { content: false, keyPoints: false },
        });
        // preserve score order from cache
        const docsById = new Map(res.docs.map((d) => [d.id, d]));
        const ordered = candidateIds
          .map((id) => docsById.get(id))
          .filter(Boolean);
        cachedResult = ordered.slice(0, limit);
      }
    }
  } catch {
    // ignore redis errors
  }

  if (cachedResult && cachedResult.length >= limit) {
    return cachedResult;
  }

  if (cachedResult && cachedResult.length > 0) {
    const remaining = limit - cachedResult.length;
    const news = await payload.find({
      collection: "news",
      limit: remaining,
      depth: 1,
      sort: "-createdAt",
      select: { content: false, keyPoints: false },
      where: {
        _status: { equals: "published" },
        id: { not_in: [...cachedResult.map((d: any) => d.id), ...excludeIds] },
      },
    });
    return [...cachedResult, ...news.docs];
  }

  const news = await payload.find({
    collection: "news",
    limit,
    depth: 1,
    sort: "-createdAt",
    select: { content: false, keyPoints: false },
    where: {
      _status: { equals: "published" },
      ...(excludeIds.length ? { id: { not_in: excludeIds } } : {}),
    },
  });
  return news.docs;
}

const trending = publicProcedure
  .input(
    z
      .object({ limit: z.number().min(1).max(50).nullish().default(3) })
      .nullish()
  )
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const limit = input?.limit ?? 3;

    const { picks } = await curatedPicks(payload, limit);
    if (picks.length >= limit) {
      return picks;
    }

    const rest = await trendingFallback(
      payload,
      limit - picks.length,
      picks.map((d: any) => d.id)
    );
    return [...picks, ...rest];
  });

const recordView = publicProcedure
  .input(
    z.object({
      newsId: z.string().optional(),
      slug: z.string().optional(),
      deviceId: z.string().max(64).optional(),
    })
  )
  .handler(async ({ input, context, errors }) => {
    const { payload, user, request } = context;
    if (!(input.newsId || input.slug)) {
      throw errors.BAD_REQUEST({
        message: "newsId or slug is required to record view",
      });
    }

    const where: Where = {};
    if (input.newsId) {
      where.id = { equals: input.newsId };
    }
    if (input.slug) {
      where.slug = { equals: input.slug };
    }
    where._status = { equals: "published" };

    const news = await payload.find({
      collection: "news",
      where,
      limit: 1,
      depth: 0,
    });
    const doc = news.docs[0];
    if (!doc) {
      throw errors.NOT_FOUND({
        message: "News not found",
      });
    }

    // determine dedupe key: prefer user id, then the app's device id, then
    // IP. An IP bucket collapses everyone behind carrier-grade NAT into one
    // count per day; a device id survives it. The header fallback stays for
    // callers old enough to send neither.
    let dedupeKey = "";
    try {
      if (user?.id) {
        dedupeKey = `news:view:${doc?.id}:user:${user.id}`;
      } else if (input.deviceId) {
        dedupeKey = `news:view:${doc?.id}:device:${input.deviceId}`;
      } else {
        const hdr =
          request?.headers?.get?.("x-forwarded-for") ||
          request?.headers?.get?.("x-real-ip");
        const ip = hdr ? String(hdr).split(",")[0]?.trim() : "anonymous";
        dedupeKey = `news:view:${doc?.id}:ip:${ip}`;
      }
    } catch {
      // If header parsing fails, fallback to anonymous dedupe key
      dedupeKey = `news:view:${doc?.id}:anon`;
    }

    // TTL for dedupe key in seconds (default 24 hours)
    const ttl = Number(process.env.VIEW_DEDUPE_TTL_SECONDS ?? 86_400);

    let incremented = true;
    try {
      const { getRedis } = await import("../../lib/redis");
      const r = getRedis();
      // set key only if not exists
      // Bun returns 'OK' when set, null when not set
      // use EX and NX to atomically check-and-set
      const res = await r.set(dedupeKey, "1", "EX", String(ttl), "NX");
      if (res === null) {
        // already viewed recently, do not increment
        incremented = false;
      }
    } catch {
      // if redis not available, fall back to incrementing always
      incremented = true;
    }

    if (incremented) {
      // Raw SQL (not payload.update) on purpose: news is a drafts/versions
      // collection, and a normal update writes a new _news_v snapshot on
      // every call, meaning every article view was generating a junk
      // editorial-history entry. It was also a non-atomic read-then-write
      // (data: { views: (doc.views ?? 0) + 1 }), so concurrent viewers could
      // race and lose an increment. Raw SQL is a single atomic UPDATE and
      // bypasses Payload's hooks/versioning entirely. The one afterChange
      // hook on News (sendNotificationOnCreate) already no-ops on repeat
      // updates via doc.hasBeenPublished, so skipping it here changes nothing.
      const { sql } = await import("@payloadcms/db-postgres");
      const result = await payload.db.drizzle.execute(sql`
        UPDATE news SET views = COALESCE(views, 0) + 1
        WHERE id = ${doc.id}
        RETURNING views
      `);
      const updatedViews = (result.rows[0] as { views: number } | undefined)
        ?.views;
      return { ok: true, views: updatedViews ?? doc.views, incremented: true };
    }

    // not incremented due to dedupe
    return { ok: true, views: doc.views ?? 0, incremented: false };
  });

const home = publicProcedure
  .input(HomeInputSchema)
  .handler(({ input, context }) => {
    const { payload } = context;
    const limit = input?.limit || 12;
    const page = input?.page || 1;

    /*
     * Which related articles appear, in what order, and whether the block
     * appears at all, all derive from this. Passive refetches (tab switch,
     * app foreground, article-back) land on the same day bucket and so get
     * the identical block back even when the 90s composed-feed cache has
     * expired underneath them — previously that expiry reshuffled "People
     * are also reading" while the articles around it stayed put, which is
     * what a returning user actually notices. A deliberate pull-to-refresh
     * sets forceRefresh and gets genuinely new picks, the same bargain the
     * ad cache already makes.
     */
    const relatedSeed = input?.forceRefresh
      ? `fresh:${Date.now()}`
      : `day:${Math.floor(Date.now() / 86_400_000)}:${page}:${limit}`;

    const buildComposedFeed = async () => {
      // 1. Fetch main news, the heaviest query
      const news = await fetchMainNews({
        payload,
        type: "article",
        limit,
        page,
      });

      // 2. Fetch supporting data in parallel (lightweight, randomized per request)
      const [related, promotionMedia] = await Promise.all([
        fetchRelatedNews({ payload, limit: 3, seed: relatedSeed }),
        fetchPromoMedia({ payload, limit: 1 }),
      ]);

      // 3. Initialize ad manager (pool is cached in Redis for 5 min)
      const adManager = await createAdManager(payload, DEFAULT_AD_CONFIG);

      // 4. Compose the feed using the feed composer (synchronous)
      const feedData: FeedComposerData = {
        mainNews: news.docs,
        relatedNews: related.docs,
        promotionMedia: promotionMedia.docs,
        relatedSeed,
      };

      const composedFeed = composeFeed(
        adManager,
        feedData,
        DEFAULT_FEED_CONFIG
      );

      return { ...news, docs: composedFeed };
    };

    // The composed feed — which articles AND which ad fills each injected
    // slot — is cached as one unit for 90s. Ad composition used to run
    // fresh on every call even though the article list itself was already
    // cached, so a passive refetch (tab switch, app foreground,
    // article-back) picked a brand-new random ad id every time, busting the
    // client's ad cache and asking Google for a fresh native ad it didn't
    // need. A deliberate pull-to-refresh sets forceRefresh and always gets a
    // genuinely fresh compose.
    return withCache(
      `news:home:${page}:${limit}`,
      { forceRefresh: input?.forceRefresh ?? false, ttl: 90 },
      buildComposedFeed
    );
  });

const one = publicProcedure
  .input(
    z.object({
      slug: z.string(),
      type: z.string().optional().default("article"),
    })
  )
  .handler(async ({ input, context, errors }) => {
    const { payload, user } = context;
    // Video news is switched off (see `all` above): refuse before Postgres
    // sees the invalid enum value.
    if (input.type === "video") {
      throw errors.NOT_FOUND({
        message: "News not found",
      });
    }
    const where: Where = {
      slug: { equals: input.slug },
      _status: { equals: "published" },
    };
    const news = await payload.find({
      collection: "news",
      where,
      depth: 2,
      limit: 1,
      context: user?.id ? { userId: user.id } : undefined,
      // draft: false,
    });
    if (!news.docs.length) {
      throw errors.NOT_FOUND({
        message: "News not found",
      });
    }
    const doc = news.docs[0]!;
    const [userReaction, totalComments] = await Promise.all([
      getUserReactionForNews(payload, user?.id, doc.id),
      getCommentCountForNews(payload, doc.id),
    ]);
    return {
      ...doc,
      content: sanitizeContent(doc.content),
      userReaction,
      totalComments,
    };
  });

/**
 * Three random-ish published articles.
 *
 * Delegates to `fetchRelatedNews`, which picks a random page off a `count()`.
 * This handler used to do that itself with `pagination: false` and no
 * `select` — hydrating every published article, at Payload's default depth of
 * 2, purely to read `totalPages` off the result and throw the documents away.
 */
const relatedNews = publicProcedure
  .input(z.number().optional())
  .handler(async ({ context }) => {
    const { payload } = context;

    const items = await fetchRelatedNews({ payload, limit: 3 });
    let relatedDocs = items.docs;

    // A random page can land short on the last page; top up from the front.
    if (relatedDocs.length < 3) {
      const seen = new Set(relatedDocs.map((d) => d.id));
      const remainingItems = await payload.find({
        collection: "news",
        depth: 1,
        limit: 3,
        sort: "-createdAt",
        page: 1,
        where: { _status: { equals: "published" } },
        draft: false,
        select: { content: false, keyPoints: false },
      });
      for (const doc of remainingItems.docs) {
        if (relatedDocs.length >= 3) {
          break;
        }
        if (!seen.has(doc.id)) {
          relatedDocs = [...relatedDocs, doc];
          seen.add(doc.id);
        }
      }
    }

    return relatedDocs.slice(0, 3);
  });

const likeDislikeInput = z.object({
  newsId: z.string(),
  userId: z.string(),
  slug: z.string(),
});

/**
 * Shared response shape returned by like/dislike. The client uses this to
 * reconcile the optimistic cache write with server truth, so no refetch is needed,
 * so the icon doesn't get clobbered by a stale read.
 */
type ReactionResponse = {
  userReaction: UserReaction;
  likesCount: number;
  dislikesCount: number;
};

const like = protectedProcedure
  .input(likeDislikeInput)
  .handler(async ({ input, context }): Promise<ReactionResponse> => {
    const { payload } = context;
    const reaction = await payload.find({
      collection: "reactions",
      where: {
        and: [
          { "target.relationTo": { equals: "news" } },
          { "target.value": { equals: input.newsId } },
          { user: { equals: input.userId } },
        ],
      },
    });

    if (reaction.docs && reaction.docs.length > 0 && reaction.docs[0]) {
      const existing = reaction.docs[0];
      if (existing.type === "like") {
        await payload.delete({
          collection: "reactions",
          id: existing.id,
        });
      } else {
        await payload.update({
          collection: "reactions",
          where: { id: { equals: existing.id } },
          data: { type: "like" },
        });
      }
    } else {
      await payload.create({
        collection: "reactions",
        data: {
          target: { relationTo: "news", value: input.newsId },
          user: input.userId,
          type: "like",
        },
      });
    }

    const [counts, userReaction] = await Promise.all([
      getNewsReactionCounts(payload, input.newsId),
      getUserReactionForNews(payload, input.userId, input.newsId),
    ]);
    return { userReaction, ...counts };
  });

const dislike = protectedProcedure
  .input(likeDislikeInput)
  .handler(async ({ input, context }): Promise<ReactionResponse> => {
    const { payload } = context;
    const reaction = await payload.find({
      collection: "reactions",
      where: {
        and: [
          { "target.relationTo": { equals: "news" } },
          { "target.value": { equals: input.newsId } },
          { user: { equals: input.userId } },
        ],
      },
    });

    if (reaction.docs.length > 0 && reaction.docs[0]) {
      const existing = reaction.docs[0];
      if (existing.type === "dislike") {
        await payload.delete({
          collection: "reactions",
          id: existing.id,
        });
      } else {
        await payload.update({
          collection: "reactions",
          where: { id: { equals: existing.id } },
          data: { type: "dislike" },
        });
      }
    } else {
      await payload.create({
        collection: "reactions",
        data: {
          target: { relationTo: "news", value: input.newsId },
          user: input.userId,
          type: "dislike",
        },
      });
    }

    const [counts, userReaction] = await Promise.all([
      getNewsReactionCounts(payload, input.newsId),
      getUserReactionForNews(payload, input.userId, input.newsId),
    ]);
    return { userReaction, ...counts };
  });

const categories = publicProcedure
  .meta(
    openapi({
      method: "GET",
      path: "/news/categories",
      tags: ["news"],
      summary: "Get all news categories",
    })
  )
  .handler(async ({ context }) => {
    const { payload } = context;
    const result = await payload.findGlobal({
      slug: "news-category",
      populate: {
        categories: {
          title: true,
          slug: true,
        },
      },
    });

    return result.items || [];
  });

export const newsRouter = {
  all,
  trending,
  recordView,
  one,
  home,
  relatedNews,
  like,
  dislike,
  categories,
  analytics: newsAnalyticsRouter,
};
