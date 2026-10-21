import { enum_partner_content_placements } from "@news-spend-media/payload/payload-generated-schema";
import z from "zod";

import { publicProcedure } from "../index";
import { clampEventTime } from "../lib/eventTime";
import {
  buildDeviceDailyCountQuery,
  buildPartnerEventsInsert,
  type PartnerEventRow,
} from "../lib/partnerEventsInsert";
import {
  PARTNER_EVENTS_DEVICE_DAILY_CAP,
  PARTNER_EVENTS_MAX_BATCH,
  PARTNER_EVENTS_MAX_DISTINCT_CONTENT,
} from "../lib/partnerEventsLimits";
import {
  partnerEventsIpRateLimitMiddleware,
  partnerEventsRateLimitMiddleware,
} from "../lib/ratelimit";

/** The surface the feed records promo-media impressions under. */
const PROMO_MEDIA_SURFACE = "homepage-ads-banner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const eventSchema = z.object({
  contentId: z.string().max(64),
  event: z.enum(["impression", "click"]),
  /** The placement the item was requested with; rejected if it is not one. */
  surface: z.enum(enum_partner_content_placements.enumValues),
  position: z.number().min(0).max(10_000).optional(),
  sessionId: z.string().min(1).max(200),
  deviceId: z.string().min(1).max(200),
  /** Minted by the app per event and resent unchanged on retry. */
  eventId: z.string().min(8).max(64).optional(),
  platform: z.enum(["android", "ios", "web"]).optional(),
  timestamp: z.string().max(64).optional(),
});

/**
 * Record impressions and taps on partner content, from the mobile app.
 *
 * Public and write-heavy, so nothing in a row is believed unchecked:
 *
 * - **What.** The item must exist, be `active`, and list the stated surface in
 *   its own `placements` (promo media has none, so only the feed surface
 *   `homepage-ads-banner` is accepted for it); anything else is dropped. The partner comes from the
 *   item, never the caller.
 * - **Who.** The user is the signed-in caller's, from the session. A `userId`
 *   in the body is ignored.
 * - **When.** The device's timestamp, clamped; arrival is stored as `received_at`.
 * - **Once.** An impression is stored once per device, session, item and
 *   surface (`dedupe_key`); an event with an `eventId` once per device. Taps
 *   carry no dedupe key, each tap counts.
 * - **How many.** At most 25 distinct items per call, and 2,000 events per
 *   device per day; the excess is dropped and counted.
 */
const track = publicProcedure
  .use(partnerEventsRateLimitMiddleware)
  .use(partnerEventsIpRateLimitMiddleware)
  .input(
    z.object({
      events: z.array(eventSchema).min(1).max(PARTNER_EVENTS_MAX_BATCH),
    })
  )
  .handler(async ({ input, context }) => {
    const { payload } = context;
    const { events } = input;
    const userId = context.user?.id ?? null;

    // Malformed ids can never match an item, and handing one to a uuid column
    // would make the lookup throw; they are dropped, not allowed to spend one
    // of the distinct-content slots.
    const wellFormed = events.filter((e) => UUID.test(e.contentId));
    const keptIds = new Set(
      [...new Set(wellFormed.map((e) => e.contentId))].slice(
        0,
        PARTNER_EVENTS_MAX_DISTINCT_CONTENT
      )
    );
    const candidates = wellFormed.filter((e) => keptIds.has(e.contentId));

    const items =
      candidates.length === 0
        ? { docs: [] }
        : await payload.find({
            collection: "partner-content",
            where: { id: { in: [...keptIds] } },
            limit: keptIds.size,
            depth: 0,
            pagination: false,
            select: {
              type: true,
              status: true,
              placements: true,
              partner: true,
            },
          });
    const itemById = new Map(items.docs.map((d) => [String(d.id), d]));

    const plausible = candidates.flatMap((e) => {
      const item = itemById.get(e.contentId);
      const partner = item?.partner;
      const partnerId = typeof partner === "object" ? partner?.id : partner;
      if (item?.status !== "active" || !partnerId) {
        return [];
      }
      // Promo media has no placements of its own (the field is hidden and may
      // be empty); the feed records it under one fixed surface.
      const surfaceAllowed =
        item.type === "promo-media"
          ? e.surface === PROMO_MEDIA_SURFACE
          : item.placements?.includes(e.surface);
      if (!surfaceAllowed) {
        return [];
      }
      return [{ e, partnerId: String(partnerId) }];
    });

    if (plausible.length === 0) {
      return {
        inserted: 0,
        duplicates: 0,
        failed: 0,
        dropped: events.length,
      };
    }

    // The per-device daily budget. Counted before the insert, so a batch
    // racing another can overshoot by one batch; the cap is a ceiling on
    // abuse, not an exact meter.
    const deviceIds = [...new Set(plausible.map((p) => p.e.deviceId))];
    const used = new Map<string, number>();
    try {
      const counted = await payload.db.drizzle.execute(
        await buildDeviceDailyCountQuery(deviceIds)
      );
      for (const row of counted.rows) {
        const { device_id: id, count } = row as {
          device_id: string;
          count: number | string;
        };
        used.set(id, Number(count));
      }
    } catch {
      // Cannot tell what the device has used: refuse the batch rather than
      // let the cap be skipped by a failing count.
      return {
        inserted: 0,
        duplicates: 0,
        failed: plausible.length,
        dropped: events.length - plausible.length,
      };
    }

    const accepted = plausible.filter(({ e }) => {
      const spent = used.get(e.deviceId) ?? 0;
      if (spent >= PARTNER_EVENTS_DEVICE_DAILY_CAP) {
        return false;
      }
      used.set(e.deviceId, spent + 1);
      return true;
    });
    const dropped = events.length - accepted.length;

    if (accepted.length === 0) {
      return { inserted: 0, duplicates: 0, failed: 0, dropped };
    }

    const receivedAt = new Date();
    const rows: PartnerEventRow[] = accepted.map(({ e, partnerId }) => ({
      contentId: e.contentId,
      partnerId,
      event: e.event,
      surface: e.surface,
      position: e.position ?? null,
      userId,
      sessionId: e.sessionId,
      deviceId: e.deviceId,
      platform: e.platform ?? null,
      timestamp: clampEventTime(e.timestamp, receivedAt),
      receivedAt,
      eventId: e.eventId ?? null,
      dedupeKey:
        e.event === "impression"
          ? `imp:${e.deviceId}:${e.sessionId}:${e.contentId}:${e.surface}`
          : null,
    }));

    try {
      const result = await payload.db.drizzle.execute(
        await buildPartnerEventsInsert(rows)
      );
      const inserted = result.rows.length;
      return {
        inserted,
        duplicates: accepted.length - inserted,
        failed: 0,
        dropped,
      };
    } catch {
      // One statement, so a failure means none of it landed.
      return { inserted: 0, duplicates: 0, failed: accepted.length, dropped };
    }
  });

export const partnerContentEventsRouter = {
  track,
};
