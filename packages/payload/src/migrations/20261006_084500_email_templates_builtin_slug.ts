import type {
  MigrateDownArgs,
  MigrateUpArgs,
} from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Email template slug back on Payload's built-in slug field.
 *
 * Reverts 20261006_083000: the lock checkbox returns to `generate_slug` /
 * `version_generate_slug`. The `slug` column itself is unchanged.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "slug_lock";
  ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "generate_slug" boolean DEFAULT true NOT NULL;
  ALTER TABLE "_email_templates_v" DROP COLUMN IF EXISTS "version_slug_lock";
  ALTER TABLE "_email_templates_v" ADD COLUMN IF NOT EXISTS "version_generate_slug" boolean;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "generate_slug";
  ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "slug_lock" boolean DEFAULT true NOT NULL;
  ALTER TABLE "_email_templates_v" DROP COLUMN IF EXISTS "version_generate_slug";
  ALTER TABLE "_email_templates_v" ADD COLUMN IF NOT EXISTS "version_slug_lock" boolean;`)
}
