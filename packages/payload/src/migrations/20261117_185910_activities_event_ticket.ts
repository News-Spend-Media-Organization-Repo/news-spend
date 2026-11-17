import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_activities_action" ADD VALUE 'eventTicket' BEFORE 'lottery';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "activities" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_activities_action";
  CREATE TYPE "public"."enum_activities_action" AS ENUM('signUp', 'watchLive', 'read', 'dailyLogin', 'share', 'connectBrandAd', 'referral', 'ticketPurchase', 'lottery', 'surveyTask', 'musicListeningTime', 'partnerContentTask', 'pointReversal');
  ALTER TABLE "activities" ALTER COLUMN "action" SET DATA TYPE "public"."enum_activities_action" USING "action"::"public"."enum_activities_action";`)
}
