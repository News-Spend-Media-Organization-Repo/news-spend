import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * One account per email address.
 *
 * `users.email` was never indexed at all, so nothing stopped a second row with
 * the same address — by a race in sign-up, by an admin, or by a script. When
 * that happens the two rows get separate activity ledgers, and the person's
 * points read as zero on whichever row they happened to sign in to.
 *
 * Case-insensitive on purpose: better-auth lowercases on its own paths, but the
 * database is the last line of defence and must not care who wrote the row.
 * Partial, because guests have no email and Postgres would otherwise treat
 * every NULL as a distinct value anyway — being explicit documents the intent.
 *
 * Written by hand rather than generated: an expression index cannot be declared
 * on a Payload field. If `payload migrate:create` ever proposes dropping
 * `users_email_lower_idx`, keep it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Normalise first so a pair differing only by case fails the index below
  // instead of living on unnoticed.
  await db.execute(sql`
    UPDATE "public"."users"
       SET "email" = lower("email")
     WHERE "email" IS NOT NULL
       AND "email" <> lower("email");`);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_idx"
      ON "public"."users" (lower("email"))
      WHERE "email" IS NOT NULL;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "users_email_lower_idx";`);
}
