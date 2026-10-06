import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_discover_events_event" AS ENUM('view', 'section', 'open', 'game_launch', 'game_blocked', 'game_report');
  CREATE TYPE "public"."enum_discover_events_platform" AS ENUM('android', 'ios', 'web');
  CREATE TABLE "discover_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"event" "enum_discover_events_event" NOT NULL,
  	"section" varchar,
  	"item_type" varchar,
  	"item_id" varchar,
  	"source" varchar,
  	"user_id" varchar,
  	"session_id" varchar NOT NULL,
  	"device_id" varchar NOT NULL,
  	"platform" "enum_discover_events_platform",
  	"event_id" varchar,
  	"dedupe_key" varchar,
  	"timestamp" timestamp(3) with time zone NOT NULL,
  	"received_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discover_events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discover_events_id" uuid;
  ALTER TABLE "discover_events_rels" ADD CONSTRAINT "discover_events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discover_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discover_events_rels" ADD CONSTRAINT "discover_events_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "discover_events_event_idx" ON "discover_events" USING btree ("event");
  CREATE INDEX "discover_events_section_idx" ON "discover_events" USING btree ("section");
  CREATE INDEX "discover_events_item_type_idx" ON "discover_events" USING btree ("item_type");
  CREATE INDEX "discover_events_user_id_idx" ON "discover_events" USING btree ("user_id");
  CREATE UNIQUE INDEX "discover_events_dedupe_key_idx" ON "discover_events" USING btree ("dedupe_key");
  CREATE INDEX "discover_events_timestamp_idx" ON "discover_events" USING btree ("timestamp");
  CREATE INDEX "discover_events_updated_at_idx" ON "discover_events" USING btree ("updated_at");
  CREATE INDEX "discover_events_created_at_idx" ON "discover_events" USING btree ("created_at");
  CREATE INDEX "discover_events_rels_order_idx" ON "discover_events_rels" USING btree ("order");
  CREATE INDEX "discover_events_rels_parent_idx" ON "discover_events_rels" USING btree ("parent_id");
  CREATE INDEX "discover_events_rels_path_idx" ON "discover_events_rels" USING btree ("path");
  CREATE INDEX "discover_events_rels_admins_id_idx" ON "discover_events_rels" USING btree ("admins_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discover_events_fk" FOREIGN KEY ("discover_events_id") REFERENCES "public"."discover_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_discover_events_id_idx" ON "payload_locked_documents_rels" USING btree ("discover_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "discover_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discover_events_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "discover_events" CASCADE;
  DROP TABLE "discover_events_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_discover_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_discover_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discover_events_id";
  DROP TYPE "public"."enum_discover_events_event";
  DROP TYPE "public"."enum_discover_events_platform";`)
}
