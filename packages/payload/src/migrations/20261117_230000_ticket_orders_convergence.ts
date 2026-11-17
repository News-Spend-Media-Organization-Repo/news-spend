import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * A database that ran an intermediate commit of this branch may already have
 * some of these, and one that ran none must not crashloop at boot, so every
 * statement is idempotent.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "checkout_url" varchar;
  ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "checkout_expires_at" timestamp(3) with time zone;
  ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "points_reversed" numeric DEFAULT 0;
  CREATE UNIQUE INDEX IF NOT EXISTS "ticket_orders_idempotency_key_idx" ON "ticket_orders" USING btree ("idempotency_key");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // No-op: these columns may predate this migration, so dropping them would
  // destroy data the earlier migrations own.
  await db.execute(sql`SELECT 1;`);
}
