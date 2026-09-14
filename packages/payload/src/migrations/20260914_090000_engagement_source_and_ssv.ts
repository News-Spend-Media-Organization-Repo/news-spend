import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Tells a Boost earned from a partner item apart from one earned from a
 * Google rewarded ad, and gives the latter something to dedupe on.
 *
 * `source` is backfilled to 'partner' rather than left null. Every engagement
 * written before this migration came from the app's own path, which only ever
 * recorded a partner item, so 'partner' is the true value for all of them —
 * and the column is NOT NULL, which nothing existing could satisfy otherwise.
 *
 * `verification_id` holds Google's transaction id and is unique, which is what
 * actually stops one verified impression being spent as two Boosts. Partner
 * engagements leave it null and dedupe on the item instead; Postgres treats
 * nulls as distinct in a unique index, so any number of them coexist.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_giveaway_engagements_source" AS ENUM('partner', 'google');

    ALTER TABLE "giveaway_engagements"
      ADD COLUMN "source" "enum_giveaway_engagements_source" DEFAULT 'partner' NOT NULL;

    ALTER TABLE "giveaway_engagements"
      ADD COLUMN "verification_id" varchar;

    CREATE INDEX "giveaway_engagements_source_idx"
      ON "giveaway_engagements" USING btree ("source");

    CREATE UNIQUE INDEX "giveaway_engagements_verification_id_idx"
      ON "giveaway_engagements" USING btree ("verification_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "giveaway_engagements_verification_id_idx";
    DROP INDEX IF EXISTS "giveaway_engagements_source_idx";

    ALTER TABLE "giveaway_engagements" DROP COLUMN IF EXISTS "verification_id";
    ALTER TABLE "giveaway_engagements" DROP COLUMN IF EXISTS "source";

    DROP TYPE IF EXISTS "public"."enum_giveaway_engagements_source";
  `);
}
