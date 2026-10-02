import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ALTER COLUMN "wish" DROP NOT NULL;
  ALTER TABLE "giveaways" ADD COLUMN "send_announcement" boolean DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ALTER COLUMN "wish" SET NOT NULL;
  ALTER TABLE "giveaways" DROP COLUMN "send_announcement";`)
}
