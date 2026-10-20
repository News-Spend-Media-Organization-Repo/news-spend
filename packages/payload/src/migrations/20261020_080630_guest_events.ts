import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_guest_events_kind" AS ENUM('created', 'converted');
  CREATE TABLE "guest_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"kind" "enum_guest_events_kind" NOT NULL,
  	"anonymous_user_id" varchar NOT NULL,
  	"user_id" varchar,
  	"guest_created_at" timestamp(3) with time zone NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"created_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "guest_events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "guest_events_id" uuid;
  ALTER TABLE "guest_events_rels" ADD CONSTRAINT "guest_events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."guest_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "guest_events_rels" ADD CONSTRAINT "guest_events_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "guest_events_kind_idx" ON "guest_events" USING btree ("kind");
  CREATE INDEX "guest_events_anonymous_user_id_idx" ON "guest_events" USING btree ("anonymous_user_id");
  CREATE INDEX "guest_events_user_id_idx" ON "guest_events" USING btree ("user_id");
  CREATE UNIQUE INDEX "kind_anonymousUserId_idx" ON "guest_events" USING btree ("kind","anonymous_user_id");
  CREATE UNIQUE INDEX "anonymousUserId_userId_idx" ON "guest_events" USING btree ("anonymous_user_id","user_id");
  CREATE INDEX "guest_events_rels_order_idx" ON "guest_events_rels" USING btree ("order");
  CREATE INDEX "guest_events_rels_parent_idx" ON "guest_events_rels" USING btree ("parent_id");
  CREATE INDEX "guest_events_rels_path_idx" ON "guest_events_rels" USING btree ("path");
  CREATE INDEX "guest_events_rels_admins_id_idx" ON "guest_events_rels" USING btree ("admins_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_guest_events_fk" FOREIGN KEY ("guest_events_id") REFERENCES "public"."guest_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_guest_events_id_idx" ON "payload_locked_documents_rels" USING btree ("guest_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "guest_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "guest_events_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "guest_events" CASCADE;
  DROP TABLE "guest_events_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_guest_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_guest_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "guest_events_id";
  DROP TYPE "public"."enum_guest_events_kind";`)
}
