import type { BasePayload } from "payload";

export type PostbackOutcome =
  | "accepted"
  | "failed_reported"
  | "duplicate"
  | "rejected";

/**
 * Notes what became of a partner's postback, so the partner and staff can see
 * it later. It only ever *records*: it must never change what the postback
 * does.
 *
 * That is why it swallows its own failure. The handler that calls it credits
 * points, and a full disk or a dropped connection here must not turn a paid
 * conversion into an error, or make a partner retry one we already settled.
 *
 * One row per click and outcome (`ON CONFLICT DO NOTHING` against a unique
 * key), so a partner who retries is not counted again, and nothing sent at the
 * public endpoint can make this table larger than a few rows per click that
 * exists. The caller records only postbacks that name a real click, since only
 * those can be attributed to a partner.
 */
export async function recordPostback(
  payload: BasePayload,
  entry: {
    partnerId: string;
    clickId: string;
    outcome: PostbackOutcome;
    /** Our own verification's reason, for a rejection. Never caller input. */
    reason?: string;
  }
): Promise<void> {
  try {
    const { sql } = await import("@payloadcms/db-postgres");
    await payload.db.drizzle.execute(sql`
      INSERT INTO partner_postbacks (partner_id, click_id, outcome, reason, received_at)
      VALUES (
        ${entry.partnerId}::uuid,
        ${entry.clickId},
        ${entry.outcome}::enum_partner_postbacks_outcome,
        ${entry.reason ?? null},
        ${new Date().toISOString()}::timestamptz
      )
      ON CONFLICT (click_id, outcome) DO NOTHING
    `);
  } catch (error) {
    payload.logger.warn(
      { err: error, clickId: entry.clickId, outcome: entry.outcome },
      "[partner] could not record a postback outcome"
    );
  }
}
