import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * One activation push per giveaway.
 *
 * The activation hook keyed off "status is now active", so drafting a live
 * giveaway and activating it again announced it a second time as if it were
 * brand new. The flag makes the announcement a one-time event, the way
 * `news.has_been_published` does for articles.
 *
 * Existing giveaways default to false; the hook still requires a draft→active
 * transition, so an already-live giveaway is not announced by this migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "giveaways"
      ADD COLUMN IF NOT EXISTS "has_been_announced" boolean DEFAULT false;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "giveaways" DROP COLUMN IF EXISTS "has_been_announced";`);
}
