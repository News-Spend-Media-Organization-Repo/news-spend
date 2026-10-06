import type {
  MigrateDownArgs,
  MigrateUpArgs,
} from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Email templates leave the audit-fields plugin (`excludedCollections`).
 *
 * The plugin's `createdBy` / `lastModifiedBy` relationship fields render in
 * the document sidebar, squeezing the Design tab's studio + inspector
 * two-column layout. Version history still tracks who changed what and
 * when, so nothing of value is lost. With no relationship fields left, the
 * `*_rels` tables go away too.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "email_templates_rels" CASCADE;
  DROP TABLE IF EXISTS "_email_templates_v_rels" CASCADE;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "email_templates_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  CREATE TABLE IF NOT EXISTS "_email_templates_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  ALTER TABLE "email_templates_rels" ADD CONSTRAINT "email_templates_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "email_templates_rels" ADD CONSTRAINT "email_templates_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_email_templates_v_rels" ADD CONSTRAINT "_email_templates_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_email_templates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_email_templates_v_rels" ADD CONSTRAINT "_email_templates_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;`)
}
