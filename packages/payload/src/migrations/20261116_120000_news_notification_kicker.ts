import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * A push prefix sits in front of the headline instead of replacing it.
 *
 * Editors were typing "JUST IN" into `notification_title`, which is a full
 * override, so the push arrived titled only "JUST IN" and the headline fell
 * into the truncated body. The prefix is stored separately and composed at
 * send time, so it can never swallow the headline again.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "news"
      ADD COLUMN IF NOT EXISTS "notification_kicker" varchar;
    ALTER TABLE "_news_v"
      ADD COLUMN IF NOT EXISTS "version_notification_kicker" varchar;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "news" DROP COLUMN IF EXISTS "notification_kicker";
    ALTER TABLE "_news_v" DROP COLUMN IF EXISTS "version_notification_kicker";`);
}
