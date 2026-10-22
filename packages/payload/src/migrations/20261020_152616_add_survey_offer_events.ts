import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_survey_offer_events_provider" AS ENUM('cpx', 'rapido', 'theorem', 'bitlabs');
  CREATE TABLE "survey_offer_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"provider" "enum_survey_offer_events_provider" NOT NULL,
  	"user_id" uuid,
  	"country" varchar,
  	"offer_count" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "survey_offer_events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "survey_offer_events_id" uuid;
  ALTER TABLE "survey_offer_events" ADD CONSTRAINT "survey_offer_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "survey_offer_events_rels" ADD CONSTRAINT "survey_offer_events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."survey_offer_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "survey_offer_events_rels" ADD CONSTRAINT "survey_offer_events_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "survey_offer_events_provider_idx" ON "survey_offer_events" USING btree ("provider");
  CREATE INDEX "survey_offer_events_user_idx" ON "survey_offer_events" USING btree ("user_id");
  CREATE INDEX "survey_offer_events_country_idx" ON "survey_offer_events" USING btree ("country");
  CREATE INDEX "survey_offer_events_updated_at_idx" ON "survey_offer_events" USING btree ("updated_at");
  CREATE INDEX "survey_offer_events_created_at_idx" ON "survey_offer_events" USING btree ("created_at");
  CREATE INDEX "survey_offer_events_rels_order_idx" ON "survey_offer_events_rels" USING btree ("order");
  CREATE INDEX "survey_offer_events_rels_parent_idx" ON "survey_offer_events_rels" USING btree ("parent_id");
  CREATE INDEX "survey_offer_events_rels_path_idx" ON "survey_offer_events_rels" USING btree ("path");
  CREATE INDEX "survey_offer_events_rels_admins_id_idx" ON "survey_offer_events_rels" USING btree ("admins_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_survey_offer_events_fk" FOREIGN KEY ("survey_offer_events_id") REFERENCES "public"."survey_offer_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_survey_offer_events_id_idx" ON "payload_locked_documents_rels" USING btree ("survey_offer_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "survey_offer_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "survey_offer_events_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "survey_offer_events" CASCADE;
  DROP TABLE "survey_offer_events_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_survey_offer_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_survey_offer_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "survey_offer_events_id";
  DROP TYPE "public"."enum_survey_offer_events_provider";`)
}
