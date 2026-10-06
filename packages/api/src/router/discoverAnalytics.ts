import z from "zod";

import { publicProcedure } from "../index";
import { clampEventTime } from "../lib/eventTime";
import { discoverTrackRateLimitMiddleware } from "../lib/ratelimit";

const eventSchema = z.object({
  event: z.enum([
    "view",
    "section",
    "open",
    "game_launch",
    "game_blocked",
    "game_report",
  ]),
  section: z.string().max(32).optional(),
  itemType: z.string().max(32).optional(),
  itemId: z.string().max(128).optional(),
  source: z.string().max(32).optional(),
  sessionId: z.string().max(200),
  deviceId: z.string().max(200),
  /** Sent unchanged on every retry; stored once per device. */
  eventId: z.string().min(8).max(64).optional(),
  platform: z.enum(["android", "ios", "web"]).optional(),
  timestamp: z.string().optional(),
});

/**
 * Batch track Discover usage, called from the mobile analytics client.
 *
 * Decided here, not believed, exactly as for news events:
 *
 * - **Who.** The signed-in caller's id from the session; a guest or signed-out
 *   caller is stored with no user. Never a `userId` in the body.
 * - **When.** The device's timestamp, clamped to a window around arrival; the
 *   arrival time is stored alongside as `received_at`.
 * - **Once.** An event carrying an `eventId` is stored once per device however
 *   many times it is sent.
 */
const track = publicProcedure
  .use(discoverTrackRateLimitMiddleware)
  .input(z.object({ events: z.array(eventSchema).min(1).max(100) }))
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const { events } = input;
    const userId = context.user?.id ?? null;

    const receivedAt = new Date();
    const { sql } = await import("@payloadcms/db-postgres");

    const rows = events.map(
      (e) => sql`(
        ${e.event}::enum_discover_events_event,
        ${e.section ?? null},
        ${e.itemType ?? null},
        ${e.itemId ?? null},
        ${e.source ?? null},
        ${userId},
        ${e.sessionId},
        ${e.deviceId},
        ${e.platform ?? null}::enum_discover_events_platform,
        ${e.eventId ?? null},
        ${e.eventId ? `${e.deviceId}:${e.eventId}` : null},
        ${clampEventTime(e.timestamp, receivedAt).toISOString()}::timestamptz,
        ${receivedAt.toISOString()}::timestamptz
      )`
    );

    try {
      const result = await payload.db.drizzle.execute(sql`
        INSERT INTO discover_events
          (event, section, item_type, item_id, source, user_id, session_id, device_id, platform, event_id, dedupe_key, timestamp, received_at)
        VALUES ${sql.join(rows, sql`, `)}
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id
      `);

      // Atomic: if it did not throw, every row was stored or already stored.
      const inserted = result.rows.length;
      return {
        inserted,
        duplicates: events.length - inserted,
        failed: 0,
        dropped: 0,
      };
    } catch {
      return { inserted: 0, duplicates: 0, failed: events.length, dropped: 0 };
    }
  });

export const discoverAnalyticsRouter = {
  track,
};
