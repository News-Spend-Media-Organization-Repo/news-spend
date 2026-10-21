import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "review_prompted_at" timestamp(3) with time zone;
  CREATE INDEX "users_review_prompted_at_idx" ON "users" USING btree ("review_prompted_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "users_review_prompted_at_idx";
  ALTER TABLE "users" DROP COLUMN "review_prompted_at";`)
}
