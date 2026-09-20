import z from "zod";

import { publicProcedure } from "../../index";
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

export const newsAnalyticsRouter = {
  track,
};
