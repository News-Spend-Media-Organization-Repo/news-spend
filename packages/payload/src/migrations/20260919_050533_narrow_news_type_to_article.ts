import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Narrows news.type (and _news_v.version_type) from ('article', 'video') to
 * ('article',) now that video news is switched off.
 *
 * Generated with `payload migrate:create` as a blank migration: the snapshot
 * already records the article-only schema (it was re-baselined with the 3.90
 * upgrade), so there was no diff to emit — but production still carries the
 * old two-value enums, hence this file. The DDL below is Payload's own
 * narrowing output for this exact change.
 *
 * The UPDATE first retypes one stale draft version row (a snapshot from when
 * its parent was a video; the parent is an article today). Without it the
 * USING cast below fails and aborts the deploy migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "_news_v" SET "version_type" = 'article' WHERE "version_type" = 'video';
    ALTER TABLE "news" ALTER COLUMN "type" SET DATA TYPE text;
    ALTER TABLE "news" ALTER COLUMN "type" SET DEFAULT 'article'::text;
    DROP TYPE "public"."enum_news_type";
    CREATE TYPE "public"."enum_news_type" AS ENUM('article');
    ALTER TABLE "news" ALTER COLUMN "type" SET DEFAULT 'article'::"public"."enum_news_type";
    ALTER TABLE "news" ALTER COLUMN "type" SET DATA TYPE "public"."enum_news_type" USING "type"::"public"."enum_news_type";
    ALTER TABLE "_news_v" ALTER COLUMN "version_type" SET DATA TYPE text;
    ALTER TABLE "_news_v" ALTER COLUMN "version_type" SET DEFAULT 'article'::text;
    DROP TYPE "public"."enum__news_v_version_type";
    CREATE TYPE "public"."enum__news_v_version_type" AS ENUM('article');
    ALTER TABLE "_news_v" ALTER COLUMN "version_type" SET DEFAULT 'article'::"public"."enum__news_v_version_type";
    ALTER TABLE "_news_v" ALTER COLUMN "version_type" SET DATA TYPE "public"."enum__news_v_version_type" USING "version_type"::"public"."enum__news_v_version_type";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_news_type" ADD VALUE 'video';
    ALTER TYPE "public"."enum__news_v_version_type" ADD VALUE 'video';
  `);
}
