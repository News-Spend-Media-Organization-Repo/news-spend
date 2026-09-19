import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Schema catch-up for the Payload 3.88 -> 3.90 upgrade, generated with
 * `payload migrate:create` (plus a fresh snapshot, so future generates diff
 * cleanly again) and then trimmed to the true production delta.
 *
 * Removed from the generated statements, verified read-only against
 * production on 2026-09-19:
 * - giveaway_engagements source/verification_id (+ indexes) and its enum:
 *   already applied by 20260914_090000 (batch 30). Re-running errors.
 * - ADD VALUE 'pruneNewsAnalytics' on both jobs enums: value already present.
 * - news.type / _news_v.version_type narrowing to ('article'): BLOCKED.
 *   Production still holds 2 news rows with type='video', so the USING cast
 *   would fail and abort the deploy migration. Decide what those rows become
 *   first, then land the narrowing separately.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'schedulePublish';
  CREATE TYPE "public"."enum_moderation_settings_digest_frequency" AS ENUM('daily', 'weekly');
  CREATE TYPE "public"."enum_moderation_settings_digest_weekday" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
  ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
  ALTER TABLE "admins" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;
  ALTER TABLE "media" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "moderation_settings" ADD COLUMN "digest_enabled" boolean DEFAULT true;
  ALTER TABLE "moderation_settings" ADD COLUMN "digest_frequency" "enum_moderation_settings_digest_frequency" DEFAULT 'weekly';
  ALTER TABLE "moderation_settings" ADD COLUMN "digest_weekday" "enum_moderation_settings_digest_weekday" DEFAULT 'monday';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;
  ALTER TABLE "admins" DROP COLUMN "reset_password_requested_at";
  ALTER TABLE "media" DROP COLUMN "_objectkey";
  ALTER TABLE "moderation_settings" DROP COLUMN "digest_enabled";
  ALTER TABLE "moderation_settings" DROP COLUMN "digest_frequency";
  ALTER TABLE "moderation_settings" DROP COLUMN "digest_weekday";
  DROP TYPE "public"."enum_moderation_settings_digest_frequency";
  DROP TYPE "public"."enum_moderation_settings_digest_weekday";`)
}

// NOTE: the 'schedulePublish' enum values are intentionally not reversed
// above. Postgres cannot drop a value from an enum without rewriting the
// tables that use it; the value is inert on downgrade, so it stays.
