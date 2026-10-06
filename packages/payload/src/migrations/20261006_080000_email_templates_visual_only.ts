import type {
  MigrateDownArgs,
  MigrateUpArgs,
} from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Email templates go visual-only (react-email studio).
 *
 * Drops the Payload-native blocks scaffolding from the comparison spike:
 * the five `email_templates_blocks_*` tables, their five version tables,
 * and the `source` / `editor_json` / `text` columns they rendered from.
 * The `key` text field becomes a proper `slug` (auto-generated from `name`),
 * matching the `slugField` convention in Partners and News.
 *
 * `IF EXISTS` throughout: the 20261005_210416 spike migration may not have
 * run everywhere this lands, and drops must not fail the whole block.
 * DDL order matters: tables before the enum types their columns use,
 * columns before the types.
 *
 * Down restores the scalar columns only, not the dropped block tables:
 * those were spike scaffolding with no production rows, so rolling back
 * means re-running 20261005_210416, not this down.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "email_templates_blocks_email_heading" CASCADE;
  DROP TABLE IF EXISTS "email_templates_blocks_email_text" CASCADE;
  DROP TABLE IF EXISTS "email_templates_blocks_email_button" CASCADE;
  DROP TABLE IF EXISTS "email_templates_blocks_email_image" CASCADE;
  DROP TABLE IF EXISTS "email_templates_blocks_email_divider" CASCADE;
  DROP TABLE IF EXISTS "_email_templates_v_blocks_email_heading" CASCADE;
  DROP TABLE IF EXISTS "_email_templates_v_blocks_email_text" CASCADE;
  DROP TABLE IF EXISTS "_email_templates_v_blocks_email_button" CASCADE;
  DROP TABLE IF EXISTS "_email_templates_v_blocks_email_image" CASCADE;
  DROP TABLE IF EXISTS "_email_templates_v_blocks_email_divider" CASCADE;
  ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "source";
  ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "editor_json";
  ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "text";
  ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "key";
  ALTER TABLE "_email_templates_v" DROP COLUMN IF EXISTS "version_source";
  ALTER TABLE "_email_templates_v" DROP COLUMN IF EXISTS "version_editor_json";
  ALTER TABLE "_email_templates_v" DROP COLUMN IF EXISTS "version_text";
  DROP TYPE IF EXISTS "public"."enum_email_templates_blocks_email_heading_level";
  DROP TYPE IF EXISTS "public"."enum_email_templates_blocks_email_heading_align";
  DROP TYPE IF EXISTS "public"."enum_email_templates_source";
  DROP TYPE IF EXISTS "public"."enum__email_templates_v_blocks_email_heading_level";
  DROP TYPE IF EXISTS "public"."enum__email_templates_v_blocks_email_heading_align";
  DROP TYPE IF EXISTS "public"."enum__email_templates_v_version_source";
  DROP INDEX IF EXISTS "email_templates_key_idx";
  ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "generate_slug" boolean;
  ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "slug" varchar;
  ALTER TABLE "_email_templates_v" ADD COLUMN IF NOT EXISTS "version_generate_slug" boolean;
  ALTER TABLE "_email_templates_v" ADD COLUMN IF NOT EXISTS "version_slug" varchar;
  CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_slug_idx" ON "email_templates" USING btree ("slug");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "email_templates_slug_idx";
  ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "slug";
  ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "generate_slug";
  ALTER TABLE "_email_templates_v" DROP COLUMN IF EXISTS "version_slug";
  ALTER TABLE "_email_templates_v" DROP COLUMN IF EXISTS "version_generate_slug";
  ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "key" varchar;
  ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "editor_json" jsonb;
  ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "text" varchar;
  CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_key_idx" ON "email_templates" USING btree ("key");`)
}
