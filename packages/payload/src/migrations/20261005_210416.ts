import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_email_templates_blocks_email_heading_level" AS ENUM('h1', 'h2', 'h3');
  CREATE TYPE "public"."enum_email_templates_blocks_email_heading_align" AS ENUM('left', 'center', 'right');
  CREATE TYPE "public"."enum_email_templates_source" AS ENUM('blocks', 'visual');
  CREATE TYPE "public"."enum_email_templates_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__email_templates_v_blocks_email_heading_level" AS ENUM('h1', 'h2', 'h3');
  CREATE TYPE "public"."enum__email_templates_v_blocks_email_heading_align" AS ENUM('left', 'center', 'right');
  CREATE TYPE "public"."enum__email_templates_v_version_source" AS ENUM('blocks', 'visual');
  CREATE TYPE "public"."enum__email_templates_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "email_templates_blocks_email_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"level" "enum_email_templates_blocks_email_heading_level" DEFAULT 'h1',
  	"align" "enum_email_templates_blocks_email_heading_align" DEFAULT 'left',
  	"block_name" varchar
  );
  
  CREATE TABLE "email_templates_blocks_email_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "email_templates_blocks_email_button" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "email_templates_blocks_email_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" uuid,
  	"alt" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "email_templates_blocks_email_divider" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "email_templates" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar,
  	"name" varchar,
  	"subject" varchar,
  	"preview_text" varchar,
  	"source" "enum_email_templates_source" DEFAULT 'blocks',
  	"editor_json" jsonb,
  	"html" varchar,
  	"text" varchar,
  	"variables" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_email_templates_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "email_templates_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  CREATE TABLE "_email_templates_v_blocks_email_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"heading" varchar,
  	"level" "enum__email_templates_v_blocks_email_heading_level" DEFAULT 'h1',
  	"align" "enum__email_templates_v_blocks_email_heading_align" DEFAULT 'left',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_email_templates_v_blocks_email_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"content" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_email_templates_v_blocks_email_button" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"url" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_email_templates_v_blocks_email_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"image_id" uuid,
  	"alt" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_email_templates_v_blocks_email_divider" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_email_templates_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_key" varchar,
  	"version_name" varchar,
  	"version_subject" varchar,
  	"version_preview_text" varchar,
  	"version_source" "enum__email_templates_v_version_source" DEFAULT 'blocks',
  	"version_editor_json" jsonb,
  	"version_html" varchar,
  	"version_text" varchar,
  	"version_variables" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__email_templates_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_email_templates_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_templates_id" uuid;
  ALTER TABLE "email_templates_blocks_email_heading" ADD CONSTRAINT "email_templates_blocks_email_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "email_templates_blocks_email_text" ADD CONSTRAINT "email_templates_blocks_email_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "email_templates_blocks_email_button" ADD CONSTRAINT "email_templates_blocks_email_button_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "email_templates_blocks_email_image" ADD CONSTRAINT "email_templates_blocks_email_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_templates_blocks_email_image" ADD CONSTRAINT "email_templates_blocks_email_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "email_templates_blocks_email_divider" ADD CONSTRAINT "email_templates_blocks_email_divider_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "email_templates_rels" ADD CONSTRAINT "email_templates_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "email_templates_rels" ADD CONSTRAINT "email_templates_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_email_templates_v_blocks_email_heading" ADD CONSTRAINT "_email_templates_v_blocks_email_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_email_templates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_email_templates_v_blocks_email_text" ADD CONSTRAINT "_email_templates_v_blocks_email_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_email_templates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_email_templates_v_blocks_email_button" ADD CONSTRAINT "_email_templates_v_blocks_email_button_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_email_templates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_email_templates_v_blocks_email_image" ADD CONSTRAINT "_email_templates_v_blocks_email_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_email_templates_v_blocks_email_image" ADD CONSTRAINT "_email_templates_v_blocks_email_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_email_templates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_email_templates_v_blocks_email_divider" ADD CONSTRAINT "_email_templates_v_blocks_email_divider_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_email_templates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_email_templates_v" ADD CONSTRAINT "_email_templates_v_parent_id_email_templates_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_email_templates_v_rels" ADD CONSTRAINT "_email_templates_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_email_templates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_email_templates_v_rels" ADD CONSTRAINT "_email_templates_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "email_templates_blocks_email_heading_order_idx" ON "email_templates_blocks_email_heading" USING btree ("_order");
  CREATE INDEX "email_templates_blocks_email_heading_parent_id_idx" ON "email_templates_blocks_email_heading" USING btree ("_parent_id");
  CREATE INDEX "email_templates_blocks_email_heading_path_idx" ON "email_templates_blocks_email_heading" USING btree ("_path");
  CREATE INDEX "email_templates_blocks_email_text_order_idx" ON "email_templates_blocks_email_text" USING btree ("_order");
  CREATE INDEX "email_templates_blocks_email_text_parent_id_idx" ON "email_templates_blocks_email_text" USING btree ("_parent_id");
  CREATE INDEX "email_templates_blocks_email_text_path_idx" ON "email_templates_blocks_email_text" USING btree ("_path");
  CREATE INDEX "email_templates_blocks_email_button_order_idx" ON "email_templates_blocks_email_button" USING btree ("_order");
  CREATE INDEX "email_templates_blocks_email_button_parent_id_idx" ON "email_templates_blocks_email_button" USING btree ("_parent_id");
  CREATE INDEX "email_templates_blocks_email_button_path_idx" ON "email_templates_blocks_email_button" USING btree ("_path");
  CREATE INDEX "email_templates_blocks_email_image_order_idx" ON "email_templates_blocks_email_image" USING btree ("_order");
  CREATE INDEX "email_templates_blocks_email_image_parent_id_idx" ON "email_templates_blocks_email_image" USING btree ("_parent_id");
  CREATE INDEX "email_templates_blocks_email_image_path_idx" ON "email_templates_blocks_email_image" USING btree ("_path");
  CREATE INDEX "email_templates_blocks_email_image_image_idx" ON "email_templates_blocks_email_image" USING btree ("image_id");
  CREATE INDEX "email_templates_blocks_email_divider_order_idx" ON "email_templates_blocks_email_divider" USING btree ("_order");
  CREATE INDEX "email_templates_blocks_email_divider_parent_id_idx" ON "email_templates_blocks_email_divider" USING btree ("_parent_id");
  CREATE INDEX "email_templates_blocks_email_divider_path_idx" ON "email_templates_blocks_email_divider" USING btree ("_path");
  CREATE UNIQUE INDEX "email_templates_key_idx" ON "email_templates" USING btree ("key");
  CREATE INDEX "email_templates_updated_at_idx" ON "email_templates" USING btree ("updated_at");
  CREATE INDEX "email_templates_created_at_idx" ON "email_templates" USING btree ("created_at");
  CREATE INDEX "email_templates__status_idx" ON "email_templates" USING btree ("_status");
  CREATE INDEX "email_templates_rels_order_idx" ON "email_templates_rels" USING btree ("order");
  CREATE INDEX "email_templates_rels_parent_idx" ON "email_templates_rels" USING btree ("parent_id");
  CREATE INDEX "email_templates_rels_path_idx" ON "email_templates_rels" USING btree ("path");
  CREATE INDEX "email_templates_rels_admins_id_idx" ON "email_templates_rels" USING btree ("admins_id");
  CREATE INDEX "_email_templates_v_blocks_email_heading_order_idx" ON "_email_templates_v_blocks_email_heading" USING btree ("_order");
  CREATE INDEX "_email_templates_v_blocks_email_heading_parent_id_idx" ON "_email_templates_v_blocks_email_heading" USING btree ("_parent_id");
  CREATE INDEX "_email_templates_v_blocks_email_heading_path_idx" ON "_email_templates_v_blocks_email_heading" USING btree ("_path");
  CREATE INDEX "_email_templates_v_blocks_email_text_order_idx" ON "_email_templates_v_blocks_email_text" USING btree ("_order");
  CREATE INDEX "_email_templates_v_blocks_email_text_parent_id_idx" ON "_email_templates_v_blocks_email_text" USING btree ("_parent_id");
  CREATE INDEX "_email_templates_v_blocks_email_text_path_idx" ON "_email_templates_v_blocks_email_text" USING btree ("_path");
  CREATE INDEX "_email_templates_v_blocks_email_button_order_idx" ON "_email_templates_v_blocks_email_button" USING btree ("_order");
  CREATE INDEX "_email_templates_v_blocks_email_button_parent_id_idx" ON "_email_templates_v_blocks_email_button" USING btree ("_parent_id");
  CREATE INDEX "_email_templates_v_blocks_email_button_path_idx" ON "_email_templates_v_blocks_email_button" USING btree ("_path");
  CREATE INDEX "_email_templates_v_blocks_email_image_order_idx" ON "_email_templates_v_blocks_email_image" USING btree ("_order");
  CREATE INDEX "_email_templates_v_blocks_email_image_parent_id_idx" ON "_email_templates_v_blocks_email_image" USING btree ("_parent_id");
  CREATE INDEX "_email_templates_v_blocks_email_image_path_idx" ON "_email_templates_v_blocks_email_image" USING btree ("_path");
  CREATE INDEX "_email_templates_v_blocks_email_image_image_idx" ON "_email_templates_v_blocks_email_image" USING btree ("image_id");
  CREATE INDEX "_email_templates_v_blocks_email_divider_order_idx" ON "_email_templates_v_blocks_email_divider" USING btree ("_order");
  CREATE INDEX "_email_templates_v_blocks_email_divider_parent_id_idx" ON "_email_templates_v_blocks_email_divider" USING btree ("_parent_id");
  CREATE INDEX "_email_templates_v_blocks_email_divider_path_idx" ON "_email_templates_v_blocks_email_divider" USING btree ("_path");
  CREATE INDEX "_email_templates_v_parent_idx" ON "_email_templates_v" USING btree ("parent_id");
  CREATE INDEX "_email_templates_v_version_version_key_idx" ON "_email_templates_v" USING btree ("version_key");
  CREATE INDEX "_email_templates_v_version_version_updated_at_idx" ON "_email_templates_v" USING btree ("version_updated_at");
  CREATE INDEX "_email_templates_v_version_version_created_at_idx" ON "_email_templates_v" USING btree ("version_created_at");
  CREATE INDEX "_email_templates_v_version_version__status_idx" ON "_email_templates_v" USING btree ("version__status");
  CREATE INDEX "_email_templates_v_created_at_idx" ON "_email_templates_v" USING btree ("created_at");
  CREATE INDEX "_email_templates_v_updated_at_idx" ON "_email_templates_v" USING btree ("updated_at");
  CREATE INDEX "_email_templates_v_latest_idx" ON "_email_templates_v" USING btree ("latest");
  CREATE INDEX "_email_templates_v_rels_order_idx" ON "_email_templates_v_rels" USING btree ("order");
  CREATE INDEX "_email_templates_v_rels_parent_idx" ON "_email_templates_v_rels" USING btree ("parent_id");
  CREATE INDEX "_email_templates_v_rels_path_idx" ON "_email_templates_v_rels" USING btree ("path");
  CREATE INDEX "_email_templates_v_rels_admins_id_idx" ON "_email_templates_v_rels" USING btree ("admins_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_templates_fk" FOREIGN KEY ("email_templates_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_email_templates_id_idx" ON "payload_locked_documents_rels" USING btree ("email_templates_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "email_templates_blocks_email_heading" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_templates_blocks_email_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_templates_blocks_email_button" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_templates_blocks_email_image" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_templates_blocks_email_divider" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_templates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_templates_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_email_templates_v_blocks_email_heading" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_email_templates_v_blocks_email_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_email_templates_v_blocks_email_button" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_email_templates_v_blocks_email_image" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_email_templates_v_blocks_email_divider" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_email_templates_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_email_templates_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "email_templates_blocks_email_heading" CASCADE;
  DROP TABLE "email_templates_blocks_email_text" CASCADE;
  DROP TABLE "email_templates_blocks_email_button" CASCADE;
  DROP TABLE "email_templates_blocks_email_image" CASCADE;
  DROP TABLE "email_templates_blocks_email_divider" CASCADE;
  DROP TABLE "email_templates" CASCADE;
  DROP TABLE "email_templates_rels" CASCADE;
  DROP TABLE "_email_templates_v_blocks_email_heading" CASCADE;
  DROP TABLE "_email_templates_v_blocks_email_text" CASCADE;
  DROP TABLE "_email_templates_v_blocks_email_button" CASCADE;
  DROP TABLE "_email_templates_v_blocks_email_image" CASCADE;
  DROP TABLE "_email_templates_v_blocks_email_divider" CASCADE;
  DROP TABLE "_email_templates_v" CASCADE;
  DROP TABLE "_email_templates_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_templates_fk";
  
  DROP INDEX "payload_locked_documents_rels_email_templates_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_templates_id";
  DROP TYPE "public"."enum_email_templates_blocks_email_heading_level";
  DROP TYPE "public"."enum_email_templates_blocks_email_heading_align";
  DROP TYPE "public"."enum_email_templates_source";
  DROP TYPE "public"."enum_email_templates_status";
  DROP TYPE "public"."enum__email_templates_v_blocks_email_heading_level";
  DROP TYPE "public"."enum__email_templates_v_blocks_email_heading_align";
  DROP TYPE "public"."enum__email_templates_v_version_source";
  DROP TYPE "public"."enum__email_templates_v_version_status";`)
}
