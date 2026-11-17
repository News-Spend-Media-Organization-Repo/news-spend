import type { Pool } from "pg";

type Querier = Pick<Pool, "query">;

/**
 * Keep the order row for accounting, drop the buyer's personal data. The FK is
 * ON DELETE SET NULL, so the row survives the auth-side user delete.
 */
export async function anonymiseTicketBuyer(
  pool: Querier,
  userId: string
): Promise<void> {
  // ticket_orders arrives with a later migration. On a schema that has not
  // applied it yet, deleting the account must still work.
  const found = await pool.query(
    "SELECT to_regclass('public.ticket_orders')::text AS present"
  );
  if (!found.rows[0]?.present) {
    return;
  }

  await pool.query(
    "UPDATE ticket_orders SET buyer_name = NULL, buyer_email = NULL, buyer_phone = NULL WHERE user_id = $1",
    [userId]
  );
}
