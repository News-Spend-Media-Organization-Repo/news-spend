import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "giveaways" ADD COLUMN "notification_title" varchar DEFAULT 'A new giveaway is live 🎁';
  ALTER TABLE "giveaways" ADD COLUMN "notification_body" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "giveaways" DROP COLUMN "notification_title";
  ALTER TABLE "giveaways" DROP COLUMN "notification_body";`)
}
