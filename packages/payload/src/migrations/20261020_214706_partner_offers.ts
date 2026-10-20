import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_content_placements" ALTER COLUMN "value" SET DATA TYPE text;
  -- Retired placements: drop them from existing rows first, or the cast back to the smaller enum fails.
  DELETE FROM "partner_content_placements" WHERE "value" IN ('discover-tab', 'shop-tab', 'product-display', 'push-notification', 'email-campaign');
  DROP TYPE "public"."enum_partner_content_placements";
  CREATE TYPE "public"."enum_partner_content_placements" AS ENUM('homepage-trending-books', 'homepage-ads-banner', 'points-mall-books', 'points-mall-apps', 'connect-brand-video', 'connect-brands-tab', 'lucky-app-wall', 'news-click-ads', 'banner-news-post', 'news-post', 'video-section');
  ALTER TABLE "partner_content_placements" ALTER COLUMN "value" SET DATA TYPE "public"."enum_partner_content_placements" USING "value"::"public"."enum_partner_content_placements";
  ALTER TABLE "partner_content" ADD COLUMN "ad_copy" varchar;
  ALTER TABLE "partner_conversions" ADD COLUMN "surface" varchar;
  ALTER TABLE "partners" ADD COLUMN "confirmation_days" numeric DEFAULT 7;
  CREATE INDEX "partner_conversions_surface_idx" ON "partner_conversions" USING btree ("surface");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partner_content_placements" ADD VALUE 'discover-tab' BEFORE 'points-mall-books';
  ALTER TYPE "public"."enum_partner_content_placements" ADD VALUE 'shop-tab' BEFORE 'news-click-ads';
  ALTER TYPE "public"."enum_partner_content_placements" ADD VALUE 'product-display' BEFORE 'video-section';
  ALTER TYPE "public"."enum_partner_content_placements" ADD VALUE 'push-notification' BEFORE 'video-section';
  ALTER TYPE "public"."enum_partner_content_placements" ADD VALUE 'email-campaign' BEFORE 'video-section';
  DROP INDEX "partner_conversions_surface_idx";
  ALTER TABLE "partner_content" DROP COLUMN "ad_copy";
  ALTER TABLE "partner_conversions" DROP COLUMN "surface";
  ALTER TABLE "partners" DROP COLUMN "confirmation_days";`)
}
