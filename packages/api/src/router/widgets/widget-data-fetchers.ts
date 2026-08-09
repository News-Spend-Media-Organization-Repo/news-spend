import type { News } from "@news-spend-media/payload/types";
import type { Payload } from "payload";

export type NewsItem = {
  id: string;
  title: string;
  slug: string;
  category?: string;
};

/**
 * Deep link for a single story, matching the `News` screen's linking path
 * (`/article/:slug/:id?`) under the news tab. Verified against the running app —
 * the tab prefix is required, `news-spend:///article/...` does not navigate.
 */
export function newsDeepLink(item: NewsItem): string {
  return `news-spend://news/article/${item.slug}/${item.id}`;
}

export type DigestData = {
  date: string;
  greeting: string;
  stories: NewsItem[];
};

function greetingForHour(hour: number): string {
  if (hour < 12) {
    return "Good Morning";
  }
  if (hour < 17) {
    return "Good Afternoon";
  }
  return "Good Evening";
}

function toNewsItem(doc: News): NewsItem {
  return {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    category: typeof doc.category === "object" ? doc.category.title : undefined,
  };
}

/**
 * Fetches trending news for the widget.
 * Reuses the same Redis-cached trending logic as the main API.
 */
export async function fetchTrendingForWidget(
  payload: Payload,
  limit = 3,
): Promise<NewsItem[]> {
  let cachedResult: NewsItem[] | null = null;

  try {
    const { getRedis } = await import("../../lib/redis");
    const r = getRedis();
    const cached = await r.get("trending:news");
    if (cached) {
      const parsed = JSON.parse(cached) as { id: string; score: number }[];
      const candidateIds = parsed.slice(0, limit * 3).map((p) => p.id);
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
        const docsById = new Map(res.docs.map((d) => [d.id, d]));
        cachedResult = candidateIds
          .map((id) => docsById.get(id))
          .filter((doc): doc is News => doc !== undefined)
          .slice(0, limit)
          .map(toNewsItem);
      }
    }
  } catch {
    // ignore redis errors
  }

  if (cachedResult && cachedResult.length >= limit) {
    return cachedResult;
  }

  const news = await payload.find({
    collection: "news",
    limit,
    depth: 1,
    sort: "-createdAt",
    select: { content: false, keyPoints: false },
    where: { _status: { equals: "published" } },
  });

  return news.docs.map(toNewsItem);
}

/**
 * Fetches news for the daily digest widget.
 * Returns recent published articles.
 */
export async function fetchDigestForWidget(
  payload: Payload,
  limit = 4,
): Promise<DigestData> {
  const now = new Date();
  const greeting = greetingForHour(now.getHours());

  const news = await payload.find({
    collection: "news",
    limit,
    depth: 1,
    sort: "-createdAt",
    select: { content: false, keyPoints: false },
    where: { _status: { equals: "published" } },
  });

  return {
    date: now.toLocaleDateString("en-NG", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    greeting,
    stories: news.docs.map(toNewsItem),
  };
}
