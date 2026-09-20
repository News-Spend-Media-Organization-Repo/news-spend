import { format, subDays } from "date-fns";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../../index";
import { clampEventTime } from "../../lib/eventTime";
import { newsTrackRateLimitMiddleware } from "../../lib/ratelimit";

const eventSchema = z.object({
  articleId: z.string().max(64),
  event: z.enum([
    "impression",
    "view",
    "read",
    "like",
    "dislike",
    "share",
    "comment",
  ]),
  sessionId: z.string().max(200),
  deviceId: z.string().max(200),
  /**
   * Minted by the app when the event happens, and sent again unchanged on every
   * retry. It lets the server recognise an event it already stored, so a batch
   * whose reply was lost counts once, not twice. Unique per device, not
   * globally: another device cannot suppress this one's event by reusing it.
   * Absent on builds that predate it, which are stored without the protection.
   */
  eventId: z.string().min(8).max(64).optional(),
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

/**
 * Batch track events, called from the mobile analytics client.
 *
 * Three things about a row are decided here rather than believed:
 *
 * - **Who.** The user is the signed-in caller's, from the session, never a
 *   `userId` in the body. Builds that still send one are ignored (the schema
 *   drops unknown keys), so a caller cannot credit events to someone else. The
 *   cost is that an event queued under one account and sent after switching to
 *   another is credited to the second. A guest who signs up is the case that
 *   matters, and there the second account is the right one.
 * - **When.** The device's timestamp, clamped to a window around arrival; the
 *   arrival time is stored alongside as `received_at`.
 * - **Once.** An event carrying an `eventId` is stored once per device however
 *   many times it is sent.
 */
const track = publicProcedure
  .use(newsTrackRateLimitMiddleware)
  .input(z.object({ events: z.array(eventSchema).min(1).max(100) }))
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const { events } = input;
    const userId = context.user?.id ?? null;

    // Resolve all article IDs up front to validate they exist
    const articleIds = [...new Set(events.map((e) => e.articleId))];
    const articles = await payload.find({
      collection: "news",
      where: { id: { in: articleIds } },
      limit: articleIds.length,
      depth: 0,
      select: {},
    });

    // `a` is annotated because a handler behind the rate-limit middleware sees
    // `context.payload` loosely typed, which leaves `docs` as `any`.
    const validIds = new Set(articles.docs.map((a: { id: string }) => a.id));
    const accepted = events.filter((e) => validIds.has(e.articleId));
    // Events naming an article that no longer exists are dropped, not failed:
    // `failed` stays "we tried to write this and could not", so the client
    // can tell a stale device queue from a database problem.
    const dropped = events.length - accepted.length;

    if (accepted.length === 0) {
      return { inserted: 0, duplicates: 0, failed: 0, dropped };
    }

    /**
     * One bulk INSERT rather than one `payload.create` per event.
     *
     * This is the app's highest-volume write path: the client flushes every
     * 10s in batches of up to 50, and each create was a separate round trip
     * (plus Payload's hook/validation machinery) — roughly 50 statements per
     * flush per active reader, against a pool of 10 connections.
     *
     * Safe to go under Payload here for the same reason the view counter
     * does: news-analytics declares no hooks, so there is nothing to skip.
     * `article_id` is a real column on the table, not a rels row, so this
     * single statement writes the whole record.
     */
    const receivedAt = new Date();
    const { sql } = await import("@payloadcms/db-postgres");

    const rows = accepted.map(
      (e) => sql`(
        ${e.articleId}::uuid,
        ${e.event}::enum_news_analytics_event,
        ${userId},
        ${e.sessionId},
        ${e.deviceId},
        ${e.platform ?? null}::enum_news_analytics_platform,
        ${JSON.stringify(e.metadata ?? {})}::jsonb,
        ${clampEventTime(e.timestamp, receivedAt).toISOString()}::timestamptz,
        ${receivedAt.toISOString()}::timestamptz,
        ${e.eventId ?? null}
      )`
    );

    try {
      // A row that conflicts on (device_id, event_id) is one this device
      // already sent, and is skipped. NULL event ids never conflict, so builds
      // that send none are stored as before.
      const result = await payload.db.drizzle.execute(sql`
        INSERT INTO news_analytics
          (article_id, event, user_id, session_id, device_id, platform, metadata, timestamp, received_at, event_id)
        VALUES ${sql.join(rows, sql`, `)}
        ON CONFLICT (device_id, event_id) DO NOTHING
        RETURNING id
      `);

      // The batch is atomic, so if it did not throw, every row was either
      // stored or recognised as one already stored. Nothing failed.
      const inserted = result.rows.length;
      return {
        inserted,
        duplicates: accepted.length - inserted,
        failed: 0,
        dropped,
      };
    } catch {
      // The batch is atomic, so a failure means none of it landed.
      return { inserted: 0, duplicates: 0, failed: accepted.length, dropped };
    }
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

    /**
     * Aggregated in Postgres, not in Bun.
     *
     * This used to `find` with `pagination: false` and tally the rows in a
     * loop — every analytics row for the window pulled into memory purely to
     * be counted. news-analytics is the fastest-growing table in the schema,
     * so that cost scaled with traffic and never came back down. GROUP BY
     * returns at most one row per (day, event): seven events over ninety days
     * is 630 rows worst case, regardless of volume.
     */
    const { sql } = await import("@payloadcms/db-postgres");
    const grouped = await payload.db.drizzle.execute(sql`
      SELECT
        to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        event,
        COUNT(*)::int AS count
      FROM news_analytics
      WHERE article_id = ${input.articleId}::uuid
        AND timestamp >= ${startDate.toISOString()}::timestamptz
      GROUP BY day, event
    `);

    const emptyCounts = () => ({
      impressions: 0,
      views: 0,
      reads: 0,
      likes: 0,
      dislikes: 0,
      shares: 0,
      comments: 0,
    });

    /** Maps the stored event name onto its (pluralised) field in the counts. */
    const FIELD_BY_EVENT = {
      impression: "impressions",
      view: "views",
      read: "reads",
      like: "likes",
      dislike: "dislikes",
      share: "shares",
      comment: "comments",
    } as const;

    type Counts = ReturnType<typeof emptyCounts>;

    const counts = emptyCounts();
    const dailyStats: Record<string, Counts> = {};

    for (const row of grouped.rows as {
      day: string;
      event: keyof typeof FIELD_BY_EVENT;
      count: number;
    }[]) {
      const field = FIELD_BY_EVENT[row.event];
      if (!field) {
        continue;
      }
      dailyStats[row.day] ??= emptyCounts();
      dailyStats[row.day][field] += row.count;
      counts[field] += row.count;
    }

    const ctr =
      counts.impressions > 0
        ? Math.round((counts.views / counts.impressions) * 10_000) / 100
        : 0;

    // Build daily trend array. A day with no events is zeroes: it previously
    // spread `counts`, which by then held the running totals, so every quiet
    // day in the trend reported the whole period's figures.
    const trend = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const dateKey = format(subDays(new Date(), i), "yyyy-MM-dd");
      trend.push({
        date: dateKey,
        ...(dailyStats[dateKey] ?? emptyCounts()),
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
    const limit = input.limit ?? 10;
    const startDate = subDays(new Date(), daysBack);

    /**
     * Counted and ranked in Postgres, then only the winning articles are
     * loaded.
     *
     * The old version pulled every matching event row at `depth: 1`, which
     * populated the related article document for each one — the same article
     * hydrated once per impression — then counted them in a Map and threw all
     * but the top ten away.
     */
    const { sql } = await import("@payloadcms/db-postgres");
    const ranked = await payload.db.drizzle.execute(sql`
      SELECT article_id, COUNT(*)::int AS count
      FROM news_analytics
      WHERE event = ${input.event}::enum_news_analytics_event
        AND timestamp >= ${startDate.toISOString()}::timestamptz
      GROUP BY article_id
      ORDER BY count DESC
      LIMIT ${limit}
    `);

    const rows = ranked.rows as { article_id: string; count: number }[];
    if (rows.length === 0) {
      return [];
    }

    // One lookup for the whole page, then reattached in rank order.
    const articles = await payload.find({
      collection: "news",
      where: { id: { in: rows.map((r) => r.article_id) } },
      limit: rows.length,
      depth: 0,
      select: { content: false, keyPoints: false },
    });
    const articleById = new Map(articles.docs.map((d) => [d.id, d]));

    return rows.map((r) => ({
      articleId: r.article_id,
      article: articleById.get(r.article_id) ?? null,
      count: r.count,
    }));
  });

export const newsAnalyticsRouter = {
  track,
  articleStats,
  topArticles,
};
