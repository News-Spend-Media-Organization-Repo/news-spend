import type { BasePayload } from "payload";

/**
 * Win the right to pay one conversion, or be refused.
 *
 * "Once per person per offer" cannot be a check followed by a write: two
 * settlements for the same person and offer (two clicks both confirmed by the
 * partner, or a tap that pays on click plus a postback) can both pass the
 * check before either writes, and both pay. This makes the check and the
 * status change one step that others wait for.
 *
 * Inside one transaction it takes a lock keyed on the person and the offer, so
 * a second claim for the same pair waits here until the first has committed.
 * The sibling check is a separate statement on purpose: under READ COMMITTED
 * each statement sees the data committed when it starts, so a statement run
 * after the lock is granted sees the winner's commit, where a check folded
 * into the same statement as the lock would not.
 *
 * Deliberately not a unique index: it would fail to build on any duplicates
 * already in the table, and the migrations run at boot.
 *
 * Returns true when this conversion is now `converted` and the caller should
 * pay it; false when someone else was already paid or this conversion is no
 * longer a click. A database error is thrown, never turned into a refusal, so
 * the caller can let the partner retry.
 */
export async function claimConversion(
  payload: BasePayload,
  args: {
    conversionId: string;
    userId: string;
    contentId: string;
    partnerOrderId?: string;
  }
): Promise<boolean> {
  const { sql } = await import("@payloadcms/db-postgres");

  return payload.db.drizzle.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${args.userId}::text || ':' || ${args.contentId}::text, 0)
      )
    `);

    const settled = await tx.execute(sql`
      SELECT 1 FROM partner_conversions
      WHERE user_id = ${args.userId}::uuid
        AND content_id = ${args.contentId}::uuid
        AND id <> ${args.conversionId}::uuid
        AND status IN ('converted', 'awarded')
      LIMIT 1
    `);
    if (settled.rows.length > 0) {
      return false;
    }

    const updated = await tx.execute(sql`
      UPDATE partner_conversions
      SET status = 'converted',
          partner_order_id = COALESCE(${args.partnerOrderId ?? null}::varchar, partner_order_id),
          converted_at = now(),
          updated_at = now()
      WHERE id = ${args.conversionId}::uuid
        AND status = 'clicked'
      RETURNING id
    `);
    return updated.rows.length === 1;
  });
}
