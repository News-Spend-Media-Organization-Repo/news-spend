/**
 * The SQL behind partner content event ingestion, kept apart from the router
 * so the integration test runs the very statements the endpoint runs.
 */

export type PartnerEventRow = {
  contentId: string;
  partnerId: string;
  event:
    | "impression"
    | "click"
    | "video_start"
    | "video_25"
    | "video_50"
    | "video_75"
    | "video_complete";
  surface: string;
  position: number | null;
  userId: string | null;
  sessionId: string;
  deviceId: string;
  platform: "android" | "ios" | "web" | null;
  timestamp: Date;
  receivedAt: Date;
  eventId: string | null;
  dedupeKey: string | null;
};

/**
 * One bulk INSERT for the whole batch.
 *
 * `ON CONFLICT DO NOTHING` has no target on purpose: a row can collide on
 * either unique index, (device_id, event_id) for a retried batch or
 * dedupe_key for an impression already counted this session, and both mean
 * "already stored". NULL event ids and NULL dedupe keys never conflict.
 */
export async function buildPartnerEventsInsert(rows: PartnerEventRow[]) {
  const { sql } = await import("@payloadcms/db-postgres");

  const values = rows.map(
    (r) => sql`(
      ${r.contentId}::uuid,
      ${r.partnerId}::uuid,
      ${r.event}::enum_partner_content_events_event,
      ${r.surface},
      ${r.position},
      ${r.userId},
      ${r.sessionId},
      ${r.deviceId},
      ${r.platform}::enum_partner_content_events_platform,
      ${r.timestamp.toISOString()}::timestamptz,
      ${r.receivedAt.toISOString()}::timestamptz,
      ${r.eventId},
      ${r.dedupeKey}
    )`
  );

  return sql`
    INSERT INTO partner_content_events
      (content_id, partner_id, event, surface, position, user_id, session_id, device_id, platform, timestamp, received_at, event_id, dedupe_key)
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
}

/** Events each of these devices has sent in the past day, one row per device. */
export async function buildDeviceDailyCountQuery(deviceIds: string[]) {
  const { sql } = await import("@payloadcms/db-postgres");

  return sql`
    SELECT device_id, count(*)::int AS count
    FROM partner_content_events
    WHERE device_id IN (${sql.join(
      deviceIds.map((id) => sql`${id}`),
      sql`, `
    )})
      AND received_at >= now() - interval '1 day'
    GROUP BY device_id
  `;
}
