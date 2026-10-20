import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_survey_settings_providers_provider" AS ENUM('cpx', 'rapido', 'theorem', 'bitlabs');
  CREATE TABLE "survey_settings_providers" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"provider" "enum_survey_settings_providers_provider" NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"priority" numeric DEFAULT 0,
  	"wall_url" varchar
  );
  
  CREATE TABLE "survey_settings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"daily_points_cap" numeric DEFAULT 20000,
  	"max_points_per_award" numeric DEFAULT 5000,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "survey_settings_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "survey_settings_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "activities" ADD COLUMN "provider_ref" varchar;
  ALTER TABLE "survey_settings_providers" ADD CONSTRAINT "survey_settings_providers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."survey_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "survey_settings_texts" ADD CONSTRAINT "survey_settings_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."survey_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "survey_settings_rels" ADD CONSTRAINT "survey_settings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."survey_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "survey_settings_rels" ADD CONSTRAINT "survey_settings_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "survey_settings_providers_order_idx" ON "survey_settings_providers" USING btree ("_order");
  CREATE INDEX "survey_settings_providers_parent_id_idx" ON "survey_settings_providers" USING btree ("_parent_id");
  CREATE INDEX "survey_settings_texts_order_parent" ON "survey_settings_texts" USING btree ("order","parent_id");
  CREATE INDEX "survey_settings_rels_order_idx" ON "survey_settings_rels" USING btree ("order");
  CREATE INDEX "survey_settings_rels_parent_idx" ON "survey_settings_rels" USING btree ("parent_id");
  CREATE INDEX "survey_settings_rels_path_idx" ON "survey_settings_rels" USING btree ("path");
  CREATE INDEX "survey_settings_rels_admins_id_idx" ON "survey_settings_rels" USING btree ("admins_id");
  CREATE UNIQUE INDEX "activities_provider_ref_idx" ON "activities" USING btree ("provider_ref");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "survey_settings_providers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "survey_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "survey_settings_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "survey_settings_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "survey_settings_providers" CASCADE;
  DROP TABLE "survey_settings" CASCADE;
  DROP TABLE "survey_settings_texts" CASCADE;
  DROP TABLE "survey_settings_rels" CASCADE;
  DROP INDEX "activities_provider_ref_idx";
  ALTER TABLE "activities" DROP COLUMN "provider_ref";
  DROP TYPE "public"."enum_survey_settings_providers_provider";`)
}
