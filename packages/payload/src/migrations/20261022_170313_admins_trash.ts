import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  CREATE INDEX "admins_deleted_at_idx" ON "admins" USING btree ("deleted_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "admins_deleted_at_idx";
  ALTER TABLE "admins" DROP COLUMN "deleted_at";`)
}
