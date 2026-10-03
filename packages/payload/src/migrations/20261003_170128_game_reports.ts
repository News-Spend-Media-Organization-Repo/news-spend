import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "content_reports" ADD COLUMN "reported_game" varchar;
  CREATE INDEX "content_reports_reported_game_idx" ON "content_reports" USING btree ("reported_game");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "content_reports_reported_game_idx";
  ALTER TABLE "content_reports" DROP COLUMN "reported_game";`)
}
