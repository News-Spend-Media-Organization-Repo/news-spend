import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false;
  ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "featured_rank" numeric;
  ALTER TABLE "_news_v" ADD COLUMN IF NOT EXISTS "version_featured" boolean DEFAULT false;
  ALTER TABLE "_news_v" ADD COLUMN IF NOT EXISTS "version_featured_rank" numeric;
  CREATE INDEX IF NOT EXISTS "news_featured_idx" ON "news" USING btree ("featured");
  CREATE INDEX IF NOT EXISTS "_news_v_version_version_featured_idx" ON "_news_v" USING btree ("version_featured");`);
  // The partner statements below are already applied in production (they
  // shipped in 20260920_215557 and 20260922_130000 without a snapshot, so
  // the diff baseline predates them). They run only when the old state is
  // still present, so this migration is a safe no-op where there is nothing
  // left to do.
  await db.execute(sql`
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'enum_partners_integration_method' AND e.enumlabel = 'postback'
    ) THEN
      ALTER TABLE "partners" ALTER COLUMN "integration_method" SET DATA TYPE text;
      ALTER TABLE "partners" ALTER COLUMN "integration_method" SET DEFAULT 'manual'::text;
      DROP TYPE "public"."enum_partners_integration_method";
      CREATE TYPE "public"."enum_partners_integration_method" AS ENUM('manual', 'webhook', 'csv');
      ALTER TABLE "partners" ALTER COLUMN "integration_method" SET DEFAULT 'manual'::"public"."enum_partners_integration_method";
      ALTER TABLE "partners" ALTER COLUMN "integration_method" SET DATA TYPE "public"."enum_partners_integration_method" USING "integration_method"::"public"."enum_partners_integration_method";
    END IF;
  END $$;`);
  await db.execute(sql`
  ALTER TABLE "partners" DROP COLUMN IF EXISTS "api_key";`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partners_integration_method" ADD VALUE IF NOT EXISTS 'postback' BEFORE 'csv';
  DROP INDEX IF EXISTS "news_featured_idx";
  DROP INDEX IF EXISTS "_news_v_version_version_featured_idx";
  ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "api_key" varchar;
  ALTER TABLE "news" DROP COLUMN IF EXISTS "featured";
  ALTER TABLE "news" DROP COLUMN IF EXISTS "featured_rank";
  ALTER TABLE "_news_v" DROP COLUMN IF EXISTS "version_featured";
  ALTER TABLE "_news_v" DROP COLUMN IF EXISTS "version_featured_rank";`);
}
