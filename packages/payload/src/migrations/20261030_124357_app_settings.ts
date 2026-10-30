import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "app_settings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"share_message" varchar DEFAULT 'News Spend is giving out Scholarships, Free Data/Airtime, Electronic Gadgets, Gift Cards and Information to help users achieve their dreams. I thought you or someone you know may be interested. You can download the App here: {link} OR search NewsSpend on your device store.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "app_settings_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "app_settings_rels" ADD CONSTRAINT "app_settings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."app_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_settings_rels" ADD CONSTRAINT "app_settings_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "app_settings_rels_order_idx" ON "app_settings_rels" USING btree ("order");
  CREATE INDEX "app_settings_rels_parent_idx" ON "app_settings_rels" USING btree ("parent_id");
  CREATE INDEX "app_settings_rels_path_idx" ON "app_settings_rels" USING btree ("path");
  CREATE INDEX "app_settings_rels_admins_id_idx" ON "app_settings_rels" USING btree ("admins_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "app_settings" CASCADE;
  DROP TABLE "app_settings_rels" CASCADE;`)
}
