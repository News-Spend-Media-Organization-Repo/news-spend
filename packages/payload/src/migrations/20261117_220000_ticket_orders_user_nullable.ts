import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // The FK is ON DELETE SET NULL, so a required column makes deleting any
  // ticket buyer fail.
  await db.execute(sql`
   ALTER TABLE "ticket_orders" ALTER COLUMN "user_id" DROP NOT NULL;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // A no-op on purpose: restoring NOT NULL fails (and aborts the down
  // migration) once any buyer has deleted their account.
  await db.execute(sql`SELECT 1;`);
}
