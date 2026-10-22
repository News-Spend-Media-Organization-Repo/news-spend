import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * The two required relationships (`content_id`, `partner_id`) are NOT NULL, but
 * the generator creates their foreign keys ON DELETE SET NULL, which Postgres
 * cannot do on a NOT NULL column: deleting a partner or a content item that has
 * events would abort. Same defect and same fix as
 * 20260823_093000_delete_cascade_partners_giveaway. Events go with the item
 * they describe, so the keys are written ON DELETE CASCADE here and the
 * generated .json is left as the generator wrote it.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partner_content_events_event" AS ENUM('impression', 'click');
  CREATE TYPE "public"."enum_partner_content_events_platform" AS ENUM('android', 'ios', 'web');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'prunePartnerContentEvents' BEFORE 'generateVideoThumbnail';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'prunePartnerContentEvents' BEFORE 'generateVideoThumbnail';
  CREATE TABLE "partner_content_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"content_id" uuid NOT NULL,
  	"partner_id" uuid NOT NULL,
  	"event" "enum_partner_content_events_event" NOT NULL,
  	"surface" varchar NOT NULL,
  	"position" numeric,
  	"user_id" varchar,
  	"session_id" varchar NOT NULL,
  	"device_id" varchar NOT NULL,
  	"platform" "enum_partner_content_events_platform",
  	"timestamp" timestamp(3) with time zone NOT NULL,
  	"received_at" timestamp(3) with time zone,
  	"event_id" varchar,
  	"dedupe_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "partner_content_events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "partner_content_events_id" uuid;
  ALTER TABLE "partner_content_events" ADD CONSTRAINT "partner_content_events_content_id_partner_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."partner_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partner_content_events" ADD CONSTRAINT "partner_content_events_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partner_content_events_rels" ADD CONSTRAINT "partner_content_events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."partner_content_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partner_content_events_rels" ADD CONSTRAINT "partner_content_events_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partner_content_events_content_idx" ON "partner_content_events" USING btree ("content_id");
  CREATE INDEX "partner_content_events_partner_idx" ON "partner_content_events" USING btree ("partner_id");
  CREATE INDEX "partner_content_events_event_idx" ON "partner_content_events" USING btree ("event");
  CREATE INDEX "partner_content_events_user_id_idx" ON "partner_content_events" USING btree ("user_id");
  CREATE INDEX "partner_content_events_timestamp_idx" ON "partner_content_events" USING btree ("timestamp");
  CREATE UNIQUE INDEX "partner_content_events_dedupe_key_idx" ON "partner_content_events" USING btree ("dedupe_key");
  CREATE INDEX "partner_content_events_updated_at_idx" ON "partner_content_events" USING btree ("updated_at");
  CREATE INDEX "partner_content_events_created_at_idx" ON "partner_content_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "deviceId_eventId_1_idx" ON "partner_content_events" USING btree ("device_id","event_id");
  CREATE INDEX "partner_timestamp_idx" ON "partner_content_events" USING btree ("partner_id","timestamp");
  CREATE INDEX "content_timestamp_idx" ON "partner_content_events" USING btree ("content_id","timestamp");
  CREATE INDEX "partner_content_events_rels_order_idx" ON "partner_content_events_rels" USING btree ("order");
  CREATE INDEX "partner_content_events_rels_parent_idx" ON "partner_content_events_rels" USING btree ("parent_id");
  CREATE INDEX "partner_content_events_rels_path_idx" ON "partner_content_events_rels" USING btree ("path");
  CREATE INDEX "partner_content_events_rels_admins_id_idx" ON "partner_content_events_rels" USING btree ("admins_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_partner_content_events_fk" FOREIGN KEY ("partner_content_events_id") REFERENCES "public"."partner_content_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_partner_content_events_id_idx" ON "payload_locked_documents_rels" USING btree ("partner_content_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_content_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "partner_content_events_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "partner_content_events" CASCADE;
  DROP TABLE "partner_content_events_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_partner_content_events_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'sendScheduledNotification', 'sendCommentLikeNotification', 'sendModerationDigest', 'sendUrgentModerationAlert', 'checkPushReceipts', 'processGiveaway', 'cleanupAnonymousUsers', 'pruneNewsAnalytics', 'generateVideoThumbnail', 'deleteVideoThumbTemp', 'cleanupAuditLogs', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'sendScheduledNotification', 'sendCommentLikeNotification', 'sendModerationDigest', 'sendUrgentModerationAlert', 'checkPushReceipts', 'processGiveaway', 'cleanupAnonymousUsers', 'pruneNewsAnalytics', 'generateVideoThumbnail', 'deleteVideoThumbTemp', 'cleanupAuditLogs', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_partner_content_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "partner_content_events_id";
  DROP TYPE "public"."enum_partner_content_events_event";
  DROP TYPE "public"."enum_partner_content_events_platform";`)
}
