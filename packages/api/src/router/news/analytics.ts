import { format, subDays } from "date-fns";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../../index";

const eventSchema = z.object({
  articleId: z.string(),
  event: z.enum([
    "impression",
    "view",
    "read",
    "like",
    "dislike",
    "share",
    "comment",
  ]),
  sessionId: z.string(),
  deviceId: z.string(),
  platform: z.enum(["android", "ios", "web"]).optional(),
  metadata: z
    .object({
      position: z.number().optional(),
      screen: z.string().optional(),
      timeSpent: z.number().optional(),
      scrollDepth: z.number().optional(),
      shareMethod: z.string().optional(),
    })
    .optional(),
  timestamp: z.string().optional(),
});

// Batch track events, called from the mobile analytics client
const track = publicProcedure
  .input(
    z.object({
      events: z.array(eventSchema).min(1).max(100),
      userId: z.string().optional(),
    })
  )
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const { events, userId } = input;

    // Resolve all article IDs up front to validate they exist
    const articleIds = [...new Set(events.map((e) => e.articleId))];
    const articles = await payload.find({
      collection: "news",
      where: { id: { in: articleIds } },
      limit: articleIds.length,
      depth: 0,
      select: {},
    });

    const validIds = new Set(articles.docs.map((a) => a.id));

    const results = await Promise.allSettled(
      events
        .filter((e) => validIds.has(e.articleId))
        .map((e) =>
          payload.create({
            collection: "news-analytics",
            data: {
              article: e.articleId,
              event: e.event,
              userId: userId ?? undefined,
              sessionId: e.sessionId,
              deviceId: e.deviceId,
              platform: e.platform,
              metadata: e.metadata ?? {},
              timestamp: e.timestamp ?? new Date().toISOString(),
            },
          })
        )
    );

    const inserted = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return { inserted, failed };
  });

// Per-article stats for the CMS dashboard
const articleStats = protectedProcedure
  .input(
    z.object({
      articleId: z.string(),
      days: z.number().min(1).max(90).nullish().default(30),
    })
  )
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const daysBack = input.days ?? 30;
    const startDate = subDays(new Date(), daysBack);

    const result = await payload.find({
      collection: "news-analytics",
      where: {
        article: { equals: input.articleId },
        timestamp: { greater_than_equal: startDate.toISOString() },
      },
      pagination: false,
      depth: 0,
    });

    const counts = {
      impressions: 0,
      views: 0,
      reads: 0,
      likes: 0,
      dislikes: 0,
      shares: 0,
      comments: 0,
    };

    const dailyStats: Record<string, typeof counts> = {};

    for (const doc of result.docs) {
      const dateKey = format(new Date(doc.timestamp), "yyyy-MM-dd");
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { ...counts };
      }

      switch (doc.event) {
        case "impression":
          counts.impressions++;
          dailyStats[dateKey].impressions++;
          break;
        case "view":
          counts.views++;
          dailyStats[dateKey].views++;
          break;
        case "read":
          counts.reads++;
          dailyStats[dateKey].reads++;
          break;
        case "like":
          counts.likes++;
          dailyStats[dateKey].likes++;
          break;
        case "dislike":
          counts.dislikes++;
          dailyStats[dateKey].dislikes++;
          break;
        case "share":
          counts.shares++;
          dailyStats[dateKey].shares++;
          break;
        case "comment":
          counts.comments++;
          dailyStats[dateKey].comments++;
          break;
        default:
          break;
      }
    }

    const ctr =
      counts.impressions > 0
        ? Math.round((counts.views / counts.impressions) * 10_000) / 100
        : 0;

    // Build daily trend array
    const trend = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateKey = format(date, "yyyy-MM-dd");
      trend.push({
        date: dateKey,
        ...(dailyStats[dateKey] ?? { ...counts }),
      });
    }

    return {
      period: `${daysBack} days`,
      totals: counts,
      ctr,
      trend,
    };
  });

// Top articles by a given event in a time window
const topArticles = protectedProcedure
  .input(
    z.object({
      event: z
        .enum(["impression", "view", "read", "like", "share"])
        .default("view"),
      days: z.number().min(1).max(90).nullish().default(7),
      limit: z.number().min(1).max(50).nullish().default(10),
    })
  )
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const daysBack = input.days ?? 7;
    const startDate = subDays(new Date(), daysBack);

    const result = await payload.find({
      collection: "news-analytics",
      where: {
        event: { equals: input.event },
        timestamp: { greater_than_equal: startDate.toISOString() },
      },
      pagination: false,
      depth: 1,
    });

    // Count per article
    const counts = new Map<string, { count: number; article: unknown }>();
    for (const doc of result.docs) {
      const articleId =
        typeof doc.article === "object" ? doc.article.id : doc.article;
      const existing = counts.get(articleId);
      if (existing) {
        existing.count++;
      } else {
        counts.set(articleId, { count: 1, article: doc.article });
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, input.limit ?? 10)
      .map(([id, { count, article }]) => ({ articleId: id, article, count }));
  });

export const newsAnalyticsRouter = {
  track,
  articleStats,
  topArticles,
};
