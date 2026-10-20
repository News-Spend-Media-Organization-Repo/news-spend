import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "guest_conversions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"anonymous_user_id" varchar NOT NULL,
  	"user_id" varchar NOT NULL,
  	"guest_created_at" timestamp(3) with time zone NOT NULL,
  	"converted_at" timestamp(3) with time zone NOT NULL,
  	"created_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "guest_conversions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "guest_conversions_id" uuid;
  ALTER TABLE "guest_conversions_rels" ADD CONSTRAINT "guest_conversions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."guest_conversions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "guest_conversions_rels" ADD CONSTRAINT "guest_conversions_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "guest_conversions_anonymous_user_id_idx" ON "guest_conversions" USING btree ("anonymous_user_id");
  CREATE INDEX "guest_conversions_user_id_idx" ON "guest_conversions" USING btree ("user_id");
  CREATE UNIQUE INDEX "anonymousUserId_userId_idx" ON "guest_conversions" USING btree ("anonymous_user_id","user_id");
  CREATE INDEX "convertedAt_idx" ON "guest_conversions" USING btree ("converted_at");
  CREATE INDEX "guest_conversions_rels_order_idx" ON "guest_conversions_rels" USING btree ("order");
  CREATE INDEX "guest_conversions_rels_parent_idx" ON "guest_conversions_rels" USING btree ("parent_id");
  CREATE INDEX "guest_conversions_rels_path_idx" ON "guest_conversions_rels" USING btree ("path");
  CREATE INDEX "guest_conversions_rels_admins_id_idx" ON "guest_conversions_rels" USING btree ("admins_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_guest_conversions_fk" FOREIGN KEY ("guest_conversions_id") REFERENCES "public"."guest_conversions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_guest_conversions_id_idx" ON "payload_locked_documents_rels" USING btree ("guest_conversions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "guest_conversions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "guest_conversions_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "guest_conversions" CASCADE;
  DROP TABLE "guest_conversions_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_guest_conversions_fk";
  
  DROP INDEX "payload_locked_documents_rels_guest_conversions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "guest_conversions_id";`)
}
