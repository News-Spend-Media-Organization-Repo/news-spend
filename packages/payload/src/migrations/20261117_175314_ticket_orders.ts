import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ticket_orders_state" AS ENUM('pending', 'paid', 'expired', 'cancelled', 'refunded', 'failed');
  CREATE TABLE "ticket_orders" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" uuid NOT NULL,
  	"client_ref" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"reference" varchar,
  	"order_reference" varchar,
  	"state" "enum_ticket_orders_state" DEFAULT 'pending',
  	"order_version" varchar,
  	"refund_version" varchar,
  	"event_id" varchar,
  	"event_name" varchar,
  	"session_id" varchar,
  	"session_at" timestamp(3) with time zone,
  	"items" jsonb,
  	"amount_minor" numeric,
  	"currency" varchar DEFAULT 'NGN',
  	"refunded_minor" numeric DEFAULT 0,
  	"buyer_name" varchar,
  	"buyer_email" varchar,
  	"buyer_phone" varchar,
  	"points_awarded" numeric DEFAULT 0,
  	"last_synced_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ticket_orders_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ticket_orders_id" uuid;
  ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ticket_orders_rels" ADD CONSTRAINT "ticket_orders_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ticket_orders_rels" ADD CONSTRAINT "ticket_orders_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ticket_orders_user_idx" ON "ticket_orders" USING btree ("user_id");
  CREATE UNIQUE INDEX "ticket_orders_client_ref_idx" ON "ticket_orders" USING btree ("client_ref");
  CREATE UNIQUE INDEX "ticket_orders_idempotency_key_idx" ON "ticket_orders" USING btree ("idempotency_key");
  CREATE UNIQUE INDEX "ticket_orders_reference_idx" ON "ticket_orders" USING btree ("reference");
  CREATE UNIQUE INDEX "ticket_orders_order_reference_idx" ON "ticket_orders" USING btree ("order_reference");
  CREATE INDEX "ticket_orders_session_id_idx" ON "ticket_orders" USING btree ("session_id");
  CREATE INDEX "ticket_orders_updated_at_idx" ON "ticket_orders" USING btree ("updated_at");
  CREATE INDEX "ticket_orders_created_at_idx" ON "ticket_orders" USING btree ("created_at");
  CREATE INDEX "ticket_orders_rels_order_idx" ON "ticket_orders_rels" USING btree ("order");
  CREATE INDEX "ticket_orders_rels_parent_idx" ON "ticket_orders_rels" USING btree ("parent_id");
  CREATE INDEX "ticket_orders_rels_path_idx" ON "ticket_orders_rels" USING btree ("path");
  CREATE INDEX "ticket_orders_rels_admins_id_idx" ON "ticket_orders_rels" USING btree ("admins_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ticket_orders_fk" FOREIGN KEY ("ticket_orders_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ticket_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("ticket_orders_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ticket_orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ticket_orders_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ticket_orders" CASCADE;
  DROP TABLE "ticket_orders_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ticket_orders_fk";
  
  DROP INDEX "payload_locked_documents_rels_ticket_orders_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ticket_orders_id";
  DROP TYPE "public"."enum_ticket_orders_state";`)
}
