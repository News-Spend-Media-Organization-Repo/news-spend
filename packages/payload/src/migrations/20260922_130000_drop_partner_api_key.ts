import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Drops `partners.api_key`.
 *
 * It authenticated nothing: postbacks are verified with `webhook_secret`
 * (HMAC-signed, never transmitted), not this. It was generated for every
 * partner regardless of integration method and displayed in the admin, with
 * no endpoint ever checking a request against it — a credential doing no
 * work, and one more thing that could leak for zero benefit.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "partners" DROP COLUMN IF EXISTS "api_key";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "api_key" varchar;
  `);
}
