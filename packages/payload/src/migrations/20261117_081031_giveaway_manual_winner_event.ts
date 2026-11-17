import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_giveaway_audit_log_event_type" ADD VALUE 'manual_winner_added';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "giveaway_audit_log" ALTER COLUMN "event_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_giveaway_audit_log_event_type";
  CREATE TYPE "public"."enum_giveaway_audit_log_event_type" AS ENUM('ticket_purchase', 'ticket_status_change', 'boost_completion', 'featured_offer_completion', 'participants_snapshot', 'candidate_pool_built', 'candidate_pool_locked', 'checkpoint_reached', 'draw_interrupted', 'resumption_authorized', 'giveaway_cancelled', 'winner_disqualified', 'replacement_selected', 'winner_held_ticket_invalid', 'account_excluded', 'fairness_exclusion', 'loyalty_waiver_applied', 'winner_held_for_review', 'winner_selected', 'prize_allocated', 'prize_exhausted', 'budget_limit_reached', 'tier_completed', 'draw_started', 'draw_resumed', 'draw_completed', 'draw_error', 'winner_report_sent', 'claim_status_change');
  ALTER TABLE "giveaway_audit_log" ALTER COLUMN "event_type" SET DATA TYPE "public"."enum_giveaway_audit_log_event_type" USING "event_type"::"public"."enum_giveaway_audit_log_event_type";`)
}
