import type { MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_partner_content_events_event" ADD VALUE IF NOT EXISTS 'video_start';
   ALTER TYPE "public"."enum_partner_content_events_event" ADD VALUE IF NOT EXISTS 'video_25';
   ALTER TYPE "public"."enum_partner_content_events_event" ADD VALUE IF NOT EXISTS 'video_50';
   ALTER TYPE "public"."enum_partner_content_events_event" ADD VALUE IF NOT EXISTS 'video_75';
   ALTER TYPE "public"."enum_partner_content_events_event" ADD VALUE IF NOT EXISTS 'video_complete';`);
}

export async function down(): Promise<void> {
  // Postgres cannot drop a value from an enum; removing these would mean
  // recreating the type and rewriting the column. Not worth it for events.
}
