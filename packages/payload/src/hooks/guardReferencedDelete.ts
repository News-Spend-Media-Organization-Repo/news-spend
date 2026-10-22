import { sql } from "@payloadcms/db-postgres";
import type { CollectionBeforeDeleteHook, Payload } from "payload";

/**
 * Counts the rows in other tables that still point at this document through a
 * foreign key whose delete action is SET NULL.
 *
 * `required: true` on a relationship is validated by Payload, not enforced by
 * a NOT NULL column, so deleting a referenced document quietly blanks it: an
 * article loses its category, a promo block loses its image. Reading the FK
 * catalogue at delete time covers block tables and fields added later without
 * a hand-maintained list. Version tables are skipped; they are history, not
 * live content.
 */
const countReferences = async (
  payload: Payload,
  table: string,
  id: string | number
): Promise<number> => {
  const { rows } = await payload.db.drizzle.execute(sql`
    SELECT COALESCE(sum((xpath('/row/n/text()', query_to_xml(
      format('SELECT count(*) AS n FROM %s WHERE %I = %L', c.conrelid::regclass, a.attname, ${String(id)}),
      false, true, ''
    )))[1]::text::int), 0) AS refs
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) k(attnum)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.confrelid = ${table}::regclass
      AND c.confdeltype = 'n'
      AND right(c.conrelid::regclass::text, 2) <> '_v'
  `);

  return Number(rows[0]?.refs ?? 0);
};

/** Refuses to delete a document that other rows still reference. */
export const guardReferencedDelete =
  (table: string): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    const refs = await countReferences(req.payload, table, id);

    if (refs > 0) {
      throw new Error(
        `${refs} record(s) still link to this one. Reassign or remove them, then try again.`
      );
    }
  };
