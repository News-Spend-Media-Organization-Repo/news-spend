import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

/**
 * Data migration for the reactions consolidation.
 *
 * Before this migration:
 *   - reactions.news_id → news.id (flat FK)
 *   - comments.likes[] / comments.dislikes[] → inline relationship arrays
 *
 * After schema change (handled by the auto-generated schema migration):
 *   - reactions.target_id + reactions.target_relation_to (polymorphic)
 *   - comments.likesCount / comments.dislikesCount (denormalized)
 *
 * This script assumes the schema migration has already run, so:
 *   - reactions has both the old news_id column and the new target_id/target_relation_to columns
 *   - comments has the new likes_count / dislikes_count columns
 *   - comments.likes[] and comments.dislikes[] columns still exist (legacy, will be dropped later)
 *   - reactions.news_id column still exists (legacy, will be dropped later)
 *
 * Steps:
 *   1. Backfill reactions.target from reactions.news (relationTo = "news")
 *   2. Create new reaction rows from comments.likes[] (relationTo = "comments", type = "like")
 *   3. Create new reaction rows from comments.dislikes[] (relationTo = "comments", type = "dislike")
 *   4. Recalculate news.likesCount / news.dislikesCount from reactions
 *
 * Each reaction create in step 2/3 fires the afterChange hook on the reactions
 * collection, which recalculates the target doc's likesCount/dislikesCount.
 * So comments get their counts backfilled automatically.
 *
 * Step 4 is needed for news because we only UPDATE existing rows in step 1,
 * which does NOT fire the afterChange hook. We recount manually.
 *
 * After this migration completes successfully:
 *   - All reactions rows have target set
 *   - All comments and news have correct likesCount/dislikesCount
 *   - Safe to remove the legacy `news` field from Reactions.ts
 *   - Safe to remove the legacy `likes`/`dislikes` fields from Comments.ts
 *   - Run a follow-up schema migration to drop the legacy columns
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // 1. Backfill reactions.target from reactions.news.
  // Polymorphic `target` lives in reactions_rels (path = "target", news_id or
  // comments_id set). The reactions.news_id column is legacy; the rels row
  // is the source of truth.
  await db.execute(sql`
    INSERT INTO "reactions_rels" ("parent_id", "path", "news_id", "order")
    SELECT r.id, 'target', r.news_id, 0
    FROM "reactions" r
    WHERE r.news_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "reactions_rels" rel
        WHERE rel."parent_id" = r.id
          AND rel."path" = 'target'
      );
  `);

  payload.logger.info("Backfilled reactions.target from reactions.news");

  // 2 & 3. Iterate comments and create reaction rows from inline arrays.
  // Each create fires the afterChange hook, which recalculates the comment's
  // likesCount / dislikesCount automatically.
  let page = 1;
  const limit = 100;
  let processed = 0;

  while (true) {
    const comments = await payload.find({
      collection: "comments",
      limit,
      page,
      depth: 0,
      overrideAccess: true,
    });

    if (comments.docs.length === 0) {
      break;
    }

    for (const comment of comments.docs) {
      const commentId = typeof comment.id === "string" ? comment.id : String(comment.id);

      // Normalize likes/dislikes to string[] of user IDs
      const likeUserIds = (comment.likes ?? []).map((u: unknown) =>
        typeof u === "string" ? u : (u as { id: string }).id,
      );
      const dislikeUserIds = (comment.dislikes ?? []).map((u: unknown) =>
        typeof u === "string" ? u : (u as { id: string }).id,
      );

      for (const userId of likeUserIds) {
        // Check if a reaction row already exists for this user+target
        // (idempotency: if migration is re-run, skip existing rows)
        const existing = await payload.find({
          collection: "reactions",
          where: {
            "user.id": { equals: userId },
            "target.value": { equals: commentId },
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        });

        if (existing.docs.length > 0) {
          continue;
        }

        await payload.create({
          collection: "reactions",
          // `target` is a polymorphic field added in this migration's
          // schema change; the generated Reaction type doesn't include
          // it yet. Cast to any until types are regenerated.
          data: {
            user: userId,
            target: { relationTo: "comments", value: commentId },
            type: "like",
          } as any,
          depth: 0,
          overrideAccess: true,
        });
      }

      for (const userId of dislikeUserIds) {
        const existing = await payload.find({
          collection: "reactions",
          where: {
            "user.id": { equals: userId },
            "target.value": { equals: commentId },
          } as any,
          limit: 1,
          depth: 0,
          overrideAccess: true,
        });

        if (existing.docs.length > 0) {
          continue;
        }

        await payload.create({
          collection: "reactions",
          // `target` is a polymorphic field added in this migration's
          // schema change; the generated Reaction type doesn't include
          // it yet. Cast to any until types are regenerated.
          data: {
            user: userId,
            target: { relationTo: "comments", value: commentId },
            type: "dislike",
          } as any,
          depth: 0,
          overrideAccess: true,
        });
      }

      processed++;
    }

    payload.logger.info(
      `Processed ${processed} comments (page ${page}, ${comments.docs.length} docs)`,
    );

    if (comments.docs.length < limit) {
      break;
    }
    page++;
  }

  payload.logger.info(`Created reaction rows for ${processed} comments' inline likes/dislikes`);

  // 4. Recalculate news.likesCount / news.dislikesCount
  // We can't rely on the afterChange hook here because step 1 was an INSERT
  // into reactions_rels (not a Payload create), so the hook didn't fire.
  // Recount manually for every news doc that has reactions.
  const newsWithReactions = await db.execute(sql`
    SELECT DISTINCT "news_id"
    FROM "reactions_rels"
    WHERE "path" = 'target'
      AND "news_id" IS NOT NULL;
  `);

  const newsIds = (newsWithReactions.rows as Array<{ news_id: string }>).map((row) => row.news_id);

  payload.logger.info(`Recalculating reaction counts for ${newsIds.length} news docs`);

  for (const newsId of newsIds) {
    const [likesResult, dislikesResult] = await Promise.all([
      payload.count({
        collection: "reactions",
        where: {
          "target.value": { equals: newsId },
          "target.relationTo": { equals: "news" },
          type: { equals: "like" },
        },
        overrideAccess: true,
      }),
      payload.count({
        collection: "reactions",
        where: {
          "target.value": { equals: newsId },
          "target.relationTo": { equals: "news" },
          type: { equals: "dislike" },
        },
        overrideAccess: true,
      }),
    ]);

    await payload.update({
      collection: "news",
      id: newsId,
      data: {
        likesCount: likesResult.totalDocs,
        dislikesCount: dislikesResult.totalDocs,
      },
      depth: 0,
      overrideAccess: true,
    });
  }

  // 5. Backfill news.totalComments and comments.totalReplies
  payload.logger.info("Backfilling totalComments and totalReplies counts");

  const commentCounts = await db.execute(sql`
    SELECT "news_id", COUNT(*) AS count
    FROM "comments"
    WHERE "news_id" IS NOT NULL
    GROUP BY "news_id";
  `);

  for (const row of commentCounts.rows as Array<{
    news_id: string;
    count: string;
  }>) {
    await payload.update({
      collection: "news",
      id: row.news_id,
      data: {
        totalComments: Number.parseInt(row.count, 10),
      },
      depth: 0,
      overrideAccess: true,
    });
  }

  payload.logger.info(`Updated totalComments for ${commentCounts.rows.length} news docs`);

  const replyCounts = await db.execute(sql`
    SELECT "parent_id", COUNT(*) AS count
    FROM "comments"
    WHERE "parent_id" IS NOT NULL
    GROUP BY "parent_id";
  `);

  for (const row of replyCounts.rows as Array<{
    parent_id: string;
    count: string;
  }>) {
    await payload.update({
      collection: "comments",
      id: row.parent_id,
      data: {
        totalReplies: Number.parseInt(row.count, 10),
      },
      depth: 0,
      overrideAccess: true,
    });
  }

  payload.logger.info(`Updated totalReplies for ${replyCounts.rows.length} comment docs`);

  payload.logger.info("Migration complete");
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  payload.logger.warn(
    "down() does not restore inline comment.likes/dislikes arrays. " +
      "Re-run the forward migration or restore from backup if you need to roll back.",
  );
}
