import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_opportunity_sources_status" AS ENUM('pending', 'approved', 'rejected', 'paused');
  CREATE TYPE "public"."enum_opportunity_sources_trust" AS ENUM('official', 'verified', 'unverified');
  CREATE TYPE "public"."enum_opportunity_sources_ownership_review" AS ENUM('unreviewed', 'official-domain', 'publisher-confirmed', 'rejected');
  CREATE TYPE "public"."enum_opportunities_kind" AS ENUM('opportunity', 'news');
  CREATE TYPE "public"."enum_opportunities_status" AS ENUM('draft', 'published', 'expired');
  CREATE TYPE "public"."enum_opportunity_events_action" AS ENUM('open', 'read', 'save', 'share', 'more', 'less', 'dismiss');
  CREATE TYPE "public"."enum_saved_opportunities_status" AS ENUM('Interested', 'Planning to Apply', 'In Progress', 'Submitted', 'Closed');
  CREATE TYPE "public"."enum_opportunity_reports_reason" AS ENUM('Expired opportunity', 'Incorrect information', 'Suspicious or misleading content', 'Broken link', 'Duplicate content', 'Other');
  CREATE TYPE "public"."enum_opportunity_reports_status" AS ENUM('pending', 'reviewed', 'resolved');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'processOpportunities' BEFORE 'cleanupAnonymousUsers';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'processOpportunities' BEFORE 'cleanupAnonymousUsers';
  CREATE TABLE "opportunity_interests" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"preferences" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"active" boolean DEFAULT true NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "opportunity_interests_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  CREATE TABLE "opportunity_sources" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"feed_url" varchar NOT NULL,
  	"status" "enum_opportunity_sources_status" DEFAULT 'pending' NOT NULL,
  	"trust" "enum_opportunity_sources_trust" DEFAULT 'unverified' NOT NULL,
  	"category" varchar NOT NULL,
  	"quality_override" numeric,
  	"ownership_review" "enum_opportunity_sources_ownership_review" DEFAULT 'unreviewed' NOT NULL,
  	"review_notes" varchar,
  	"quality_score" numeric,
  	"last_validated_at" timestamp(3) with time zone,
  	"last_fetched_at" timestamp(3) with time zone,
  	"last_error" varchar,
  	"items_imported" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "opportunity_sources_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  CREATE TABLE "opportunities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"canonical_url" varchar NOT NULL,
  	"summary" varchar NOT NULL,
  	"category" varchar NOT NULL,
  	"category_keys" varchar,
  	"categories" jsonb DEFAULT '[]'::jsonb,
  	"duplicate_key" varchar,
  	"kind" "enum_opportunities_kind" DEFAULT 'opportunity' NOT NULL,
  	"status" "enum_opportunities_status" DEFAULT 'draft' NOT NULL,
  	"source_id" uuid NOT NULL,
  	"provider" varchar NOT NULL,
  	"location" varchar DEFAULT '',
  	"preferences" jsonb DEFAULT '[]'::jsonb,
  	"details" jsonb DEFAULT '{}'::jsonb,
  	"deadline" timestamp(3) with time zone,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"popularity" numeric DEFAULT 0,
  	"featured" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "opportunities_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  CREATE TABLE "opportunity_profiles" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" uuid NOT NULL,
  	"preferences" jsonb NOT NULL,
  	"last_notified_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "opportunity_profiles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  CREATE TABLE "opportunity_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" uuid NOT NULL,
  	"opportunity_id" uuid NOT NULL,
  	"category" varchar NOT NULL,
  	"action" "enum_opportunity_events_action" NOT NULL,
  	"event_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "opportunity_events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  CREATE TABLE "saved_opportunities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" uuid NOT NULL,
  	"opportunity_id" uuid NOT NULL,
  	"save_key" varchar NOT NULL,
  	"status" "enum_saved_opportunities_status" DEFAULT 'Interested' NOT NULL,
  	"reminder_at" timestamp(3) with time zone,
  	"reminder_sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "saved_opportunities_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  CREATE TABLE "opportunity_reports" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" uuid NOT NULL,
  	"opportunity_id" uuid NOT NULL,
  	"reason" "enum_opportunity_reports_reason" NOT NULL,
  	"details" varchar,
  	"status" "enum_opportunity_reports_status" DEFAULT 'pending' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "opportunity_reports_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  CREATE TABLE "opportunity_settings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"personalized_share" numeric DEFAULT 80 NOT NULL,
  	"featured_boost" numeric DEFAULT 8 NOT NULL,
  	"candidate_limit" numeric DEFAULT 1000 NOT NULL,
  	"source_discovery_enabled" boolean DEFAULT true,
  	"minimum_source_quality" numeric DEFAULT 60 NOT NULL,
  	"daily_digest_enabled" boolean DEFAULT true,
  	"digest_interval_hours" numeric DEFAULT 24 NOT NULL,
  	"live_enabled" boolean DEFAULT false,
  	"live_title" varchar DEFAULT 'NewsSpend Live' NOT NULL,
  	"live_description" varchar,
  	"live_stream_url" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "opportunity_settings_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "notifications" ADD COLUMN "opportunity_delivery_key" varchar;
  ALTER TABLE "_notifications_v" ADD COLUMN "version_opportunity_delivery_key" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "opportunity_interests_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "opportunity_sources_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "opportunities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "opportunity_profiles_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "opportunity_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "saved_opportunities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "opportunity_reports_id" uuid;
  ALTER TABLE "opportunity_interests_rels" ADD CONSTRAINT "opportunity_interests_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."opportunity_interests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_interests_rels" ADD CONSTRAINT "opportunity_interests_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_sources_rels" ADD CONSTRAINT "opportunity_sources_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."opportunity_sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_sources_rels" ADD CONSTRAINT "opportunity_sources_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_source_id_opportunity_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."opportunity_sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "opportunities_rels" ADD CONSTRAINT "opportunities_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunities_rels" ADD CONSTRAINT "opportunities_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_profiles" ADD CONSTRAINT "opportunity_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "opportunity_profiles_rels" ADD CONSTRAINT "opportunity_profiles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."opportunity_profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_profiles_rels" ADD CONSTRAINT "opportunity_profiles_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "opportunity_events_rels" ADD CONSTRAINT "opportunity_events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."opportunity_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_events_rels" ADD CONSTRAINT "opportunity_events_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "saved_opportunities" ADD CONSTRAINT "saved_opportunities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "saved_opportunities" ADD CONSTRAINT "saved_opportunities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "saved_opportunities_rels" ADD CONSTRAINT "saved_opportunities_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."saved_opportunities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "saved_opportunities_rels" ADD CONSTRAINT "saved_opportunities_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_reports" ADD CONSTRAINT "opportunity_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "opportunity_reports" ADD CONSTRAINT "opportunity_reports_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "opportunity_reports_rels" ADD CONSTRAINT "opportunity_reports_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."opportunity_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_reports_rels" ADD CONSTRAINT "opportunity_reports_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_settings_rels" ADD CONSTRAINT "opportunity_settings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."opportunity_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "opportunity_settings_rels" ADD CONSTRAINT "opportunity_settings_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "opportunity_interests_key_idx" ON "opportunity_interests" USING btree ("key");
  CREATE INDEX "opportunity_interests_updated_at_idx" ON "opportunity_interests" USING btree ("updated_at");
  CREATE INDEX "opportunity_interests_created_at_idx" ON "opportunity_interests" USING btree ("created_at");
  CREATE INDEX "opportunity_interests_rels_order_idx" ON "opportunity_interests_rels" USING btree ("order");
  CREATE INDEX "opportunity_interests_rels_parent_idx" ON "opportunity_interests_rels" USING btree ("parent_id");
  CREATE INDEX "opportunity_interests_rels_path_idx" ON "opportunity_interests_rels" USING btree ("path");
  CREATE INDEX "opportunity_interests_rels_admins_id_idx" ON "opportunity_interests_rels" USING btree ("admins_id");
  CREATE UNIQUE INDEX "opportunity_sources_feed_url_idx" ON "opportunity_sources" USING btree ("feed_url");
  CREATE INDEX "opportunity_sources_updated_at_idx" ON "opportunity_sources" USING btree ("updated_at");
  CREATE INDEX "opportunity_sources_created_at_idx" ON "opportunity_sources" USING btree ("created_at");
  CREATE INDEX "opportunity_sources_rels_order_idx" ON "opportunity_sources_rels" USING btree ("order");
  CREATE INDEX "opportunity_sources_rels_parent_idx" ON "opportunity_sources_rels" USING btree ("parent_id");
  CREATE INDEX "opportunity_sources_rels_path_idx" ON "opportunity_sources_rels" USING btree ("path");
  CREATE INDEX "opportunity_sources_rels_admins_id_idx" ON "opportunity_sources_rels" USING btree ("admins_id");
  CREATE UNIQUE INDEX "opportunities_canonical_url_idx" ON "opportunities" USING btree ("canonical_url");
  CREATE INDEX "opportunities_category_idx" ON "opportunities" USING btree ("category");
  CREATE INDEX "opportunities_category_keys_idx" ON "opportunities" USING btree ("category_keys");
  CREATE INDEX "opportunities_duplicate_key_idx" ON "opportunities" USING btree ("duplicate_key");
  CREATE INDEX "opportunities_status_idx" ON "opportunities" USING btree ("status");
  CREATE INDEX "opportunities_source_idx" ON "opportunities" USING btree ("source_id");
  CREATE INDEX "opportunities_deadline_idx" ON "opportunities" USING btree ("deadline");
  CREATE INDEX "opportunities_published_at_idx" ON "opportunities" USING btree ("published_at");
  CREATE INDEX "opportunities_updated_at_idx" ON "opportunities" USING btree ("updated_at");
  CREATE INDEX "opportunities_created_at_idx" ON "opportunities" USING btree ("created_at");
  CREATE INDEX "opportunities_rels_order_idx" ON "opportunities_rels" USING btree ("order");
  CREATE INDEX "opportunities_rels_parent_idx" ON "opportunities_rels" USING btree ("parent_id");
  CREATE INDEX "opportunities_rels_path_idx" ON "opportunities_rels" USING btree ("path");
  CREATE INDEX "opportunities_rels_admins_id_idx" ON "opportunities_rels" USING btree ("admins_id");
  CREATE UNIQUE INDEX "opportunity_profiles_user_idx" ON "opportunity_profiles" USING btree ("user_id");
  CREATE INDEX "opportunity_profiles_last_notified_at_idx" ON "opportunity_profiles" USING btree ("last_notified_at");
  CREATE INDEX "opportunity_profiles_updated_at_idx" ON "opportunity_profiles" USING btree ("updated_at");
  CREATE INDEX "opportunity_profiles_created_at_idx" ON "opportunity_profiles" USING btree ("created_at");
  CREATE INDEX "opportunity_profiles_rels_order_idx" ON "opportunity_profiles_rels" USING btree ("order");
  CREATE INDEX "opportunity_profiles_rels_parent_idx" ON "opportunity_profiles_rels" USING btree ("parent_id");
  CREATE INDEX "opportunity_profiles_rels_path_idx" ON "opportunity_profiles_rels" USING btree ("path");
  CREATE INDEX "opportunity_profiles_rels_admins_id_idx" ON "opportunity_profiles_rels" USING btree ("admins_id");
  CREATE INDEX "opportunity_events_user_idx" ON "opportunity_events" USING btree ("user_id");
  CREATE INDEX "opportunity_events_opportunity_idx" ON "opportunity_events" USING btree ("opportunity_id");
  CREATE UNIQUE INDEX "opportunity_events_event_key_idx" ON "opportunity_events" USING btree ("event_key");
  CREATE INDEX "opportunity_events_updated_at_idx" ON "opportunity_events" USING btree ("updated_at");
  CREATE INDEX "opportunity_events_created_at_idx" ON "opportunity_events" USING btree ("created_at");
  CREATE INDEX "opportunity_events_rels_order_idx" ON "opportunity_events_rels" USING btree ("order");
  CREATE INDEX "opportunity_events_rels_parent_idx" ON "opportunity_events_rels" USING btree ("parent_id");
  CREATE INDEX "opportunity_events_rels_path_idx" ON "opportunity_events_rels" USING btree ("path");
  CREATE INDEX "opportunity_events_rels_admins_id_idx" ON "opportunity_events_rels" USING btree ("admins_id");
  CREATE INDEX "saved_opportunities_user_idx" ON "saved_opportunities" USING btree ("user_id");
  CREATE INDEX "saved_opportunities_opportunity_idx" ON "saved_opportunities" USING btree ("opportunity_id");
  CREATE UNIQUE INDEX "saved_opportunities_save_key_idx" ON "saved_opportunities" USING btree ("save_key");
  CREATE INDEX "saved_opportunities_reminder_at_idx" ON "saved_opportunities" USING btree ("reminder_at");
  CREATE INDEX "saved_opportunities_updated_at_idx" ON "saved_opportunities" USING btree ("updated_at");
  CREATE INDEX "saved_opportunities_created_at_idx" ON "saved_opportunities" USING btree ("created_at");
  CREATE INDEX "saved_opportunities_rels_order_idx" ON "saved_opportunities_rels" USING btree ("order");
  CREATE INDEX "saved_opportunities_rels_parent_idx" ON "saved_opportunities_rels" USING btree ("parent_id");
  CREATE INDEX "saved_opportunities_rels_path_idx" ON "saved_opportunities_rels" USING btree ("path");
  CREATE INDEX "saved_opportunities_rels_admins_id_idx" ON "saved_opportunities_rels" USING btree ("admins_id");
  CREATE INDEX "opportunity_reports_user_idx" ON "opportunity_reports" USING btree ("user_id");
  CREATE INDEX "opportunity_reports_opportunity_idx" ON "opportunity_reports" USING btree ("opportunity_id");
  CREATE INDEX "opportunity_reports_updated_at_idx" ON "opportunity_reports" USING btree ("updated_at");
  CREATE INDEX "opportunity_reports_created_at_idx" ON "opportunity_reports" USING btree ("created_at");
  CREATE INDEX "opportunity_reports_rels_order_idx" ON "opportunity_reports_rels" USING btree ("order");
  CREATE INDEX "opportunity_reports_rels_parent_idx" ON "opportunity_reports_rels" USING btree ("parent_id");
  CREATE INDEX "opportunity_reports_rels_path_idx" ON "opportunity_reports_rels" USING btree ("path");
  CREATE INDEX "opportunity_reports_rels_admins_id_idx" ON "opportunity_reports_rels" USING btree ("admins_id");
  CREATE INDEX "opportunity_settings_rels_order_idx" ON "opportunity_settings_rels" USING btree ("order");
  CREATE INDEX "opportunity_settings_rels_parent_idx" ON "opportunity_settings_rels" USING btree ("parent_id");
  CREATE INDEX "opportunity_settings_rels_path_idx" ON "opportunity_settings_rels" USING btree ("path");
  CREATE INDEX "opportunity_settings_rels_admins_id_idx" ON "opportunity_settings_rels" USING btree ("admins_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_opportunity_interests_fk" FOREIGN KEY ("opportunity_interests_id") REFERENCES "public"."opportunity_interests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_opportunity_sources_fk" FOREIGN KEY ("opportunity_sources_id") REFERENCES "public"."opportunity_sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_opportunities_fk" FOREIGN KEY ("opportunities_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_opportunity_profiles_fk" FOREIGN KEY ("opportunity_profiles_id") REFERENCES "public"."opportunity_profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_opportunity_events_fk" FOREIGN KEY ("opportunity_events_id") REFERENCES "public"."opportunity_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_saved_opportunities_fk" FOREIGN KEY ("saved_opportunities_id") REFERENCES "public"."saved_opportunities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_opportunity_reports_fk" FOREIGN KEY ("opportunity_reports_id") REFERENCES "public"."opportunity_reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "notifications_opportunity_delivery_key_idx" ON "notifications" USING btree ("opportunity_delivery_key");
  CREATE INDEX "_notifications_v_version_version_opportunity_delivery_ke_idx" ON "_notifications_v" USING btree ("version_opportunity_delivery_key");
  CREATE INDEX "payload_locked_documents_rels_opportunity_interests_id_idx" ON "payload_locked_documents_rels" USING btree ("opportunity_interests_id");
  CREATE INDEX "payload_locked_documents_rels_opportunity_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("opportunity_sources_id");
  CREATE INDEX "payload_locked_documents_rels_opportunities_id_idx" ON "payload_locked_documents_rels" USING btree ("opportunities_id");
  CREATE INDEX "payload_locked_documents_rels_opportunity_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("opportunity_profiles_id");
  CREATE INDEX "payload_locked_documents_rels_opportunity_events_id_idx" ON "payload_locked_documents_rels" USING btree ("opportunity_events_id");
  CREATE INDEX "payload_locked_documents_rels_saved_opportunities_id_idx" ON "payload_locked_documents_rels" USING btree ("saved_opportunities_id");
  CREATE INDEX "payload_locked_documents_rels_opportunity_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("opportunity_reports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'processOpportunities';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'processOpportunities';
   ALTER TABLE "opportunity_interests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_interests_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_sources_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunities_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_profiles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_profiles_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_events_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "saved_opportunities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "saved_opportunities_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_reports_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "opportunity_settings_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "opportunity_interests" CASCADE;
  DROP TABLE "opportunity_interests_rels" CASCADE;
  DROP TABLE "opportunity_sources" CASCADE;
  DROP TABLE "opportunity_sources_rels" CASCADE;
  DROP TABLE "opportunities" CASCADE;
  DROP TABLE "opportunities_rels" CASCADE;
  DROP TABLE "opportunity_profiles" CASCADE;
  DROP TABLE "opportunity_profiles_rels" CASCADE;
  DROP TABLE "opportunity_events" CASCADE;
  DROP TABLE "opportunity_events_rels" CASCADE;
  DROP TABLE "saved_opportunities" CASCADE;
  DROP TABLE "saved_opportunities_rels" CASCADE;
  DROP TABLE "opportunity_reports" CASCADE;
  DROP TABLE "opportunity_reports_rels" CASCADE;
  DROP TABLE "opportunity_settings" CASCADE;
  DROP TABLE "opportunity_settings_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_opportunity_interests_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_opportunity_sources_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_opportunities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_opportunity_profiles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_opportunity_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_saved_opportunities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_opportunity_reports_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'sendScheduledNotification', 'sendCommentLikeNotification', 'sendModerationDigest', 'sendUrgentModerationAlert', 'checkPushReceipts', 'processGiveaway', 'cleanupAnonymousUsers', 'pruneNewsAnalytics', 'prunePartnerContentEvents', 'generateVideoThumbnail', 'deleteVideoThumbTemp', 'cleanupAuditLogs', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'sendScheduledNotification', 'sendCommentLikeNotification', 'sendModerationDigest', 'sendUrgentModerationAlert', 'checkPushReceipts', 'processGiveaway', 'cleanupAnonymousUsers', 'pruneNewsAnalytics', 'prunePartnerContentEvents', 'generateVideoThumbnail', 'deleteVideoThumbTemp', 'cleanupAuditLogs', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "notifications_opportunity_delivery_key_idx";
  DROP INDEX "_notifications_v_version_version_opportunity_delivery_ke_idx";
  DROP INDEX "payload_locked_documents_rels_opportunity_interests_id_idx";
  DROP INDEX "payload_locked_documents_rels_opportunity_sources_id_idx";
  DROP INDEX "payload_locked_documents_rels_opportunities_id_idx";
  DROP INDEX "payload_locked_documents_rels_opportunity_profiles_id_idx";
  DROP INDEX "payload_locked_documents_rels_opportunity_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_saved_opportunities_id_idx";
  DROP INDEX "payload_locked_documents_rels_opportunity_reports_id_idx";
  ALTER TABLE "notifications" DROP COLUMN "opportunity_delivery_key";
  ALTER TABLE "_notifications_v" DROP COLUMN "version_opportunity_delivery_key";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "opportunity_interests_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "opportunity_sources_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "opportunities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "opportunity_profiles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "opportunity_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "saved_opportunities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "opportunity_reports_id";
  DROP TYPE "public"."enum_opportunity_sources_status";
  DROP TYPE "public"."enum_opportunity_sources_trust";
  DROP TYPE "public"."enum_opportunity_sources_ownership_review";
  DROP TYPE "public"."enum_opportunities_kind";
  DROP TYPE "public"."enum_opportunities_status";
  DROP TYPE "public"."enum_opportunity_events_action";
  DROP TYPE "public"."enum_saved_opportunities_status";
  DROP TYPE "public"."enum_opportunity_reports_reason";
  DROP TYPE "public"."enum_opportunity_reports_status";`)
}
