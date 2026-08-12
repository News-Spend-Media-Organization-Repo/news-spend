import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

/**
 * Per-viewer moderation filters for the comment list.
 *
 * The previous approach loaded the viewer's entire block list and entire
 * reported-comment history onto every request and embedded both into
 * `NOT IN (...)` clauses. That grows with the viewer's lifetime activity: a
 * user who has reported two thousand comments sent a two-thousand element
 * clause on every page of every article.
 *
 * These queries instead scope both lists to the article being viewed, so the
 * result is bounded by that article's participants — typically a handful —
 * regardless of how much the viewer has blocked or reported. Both run against
 * existing indexes (`content_reports_reported_by_idx`,
 * `content_reports_rels_comments_id_idx`, `users_rels_parent_idx`).
 */

type IdRow = { id: string | null };

/**
 * Comments on this article that the viewer has reported.
 *
 * Derived from `contentReports` rather than a denormalized list on the user.
 * The user document previously carried a `reportedComments` JSON array, which
 * duplicated this and could drift from it — nothing kept the two in step when
 * a report was dismissed or a comment deleted.
 */
export async function getReportedCommentIdsForNews(
  payload: Payload,
  userId: string,
  newsId: string
): Promise<string[]> {
  const result = await payload.db.drizzle.execute(sql`
    SELECT DISTINCT rels.comments_id AS id
    FROM content_reports_rels rels
    JOIN content_reports cr ON cr.id = rels.parent_id
    JOIN comments c ON c.id = rels.comments_id
    WHERE rels.path = 'reportedItem'
      AND rels.comments_id IS NOT NULL
      AND cr.reported_by_id = ${userId}
      AND c.news_id = ${newsId}
  `);

  return extractIds(result);
}

/**
 * Users the viewer has blocked who have actually commented on this article.
 *
 * Bounded the same way: blocking five hundred people costs nothing here unless
 * those people commented on the article being read.
 */
export async function getBlockedUserIdsForNews(
  payload: Payload,
  userId: string,
  newsId: string
): Promise<string[]> {
  const result = await payload.db.drizzle.execute(sql`
    SELECT DISTINCT rels.users_id AS id
    FROM users_rels rels
    JOIN comments c ON c.user_id = rels.users_id
    WHERE rels.path = 'blockedUsers'
      AND rels.parent_id = ${userId}
      AND rels.users_id IS NOT NULL
      AND c.news_id = ${newsId}
  `);

  return extractIds(result);
}

/** Whether the viewer has reported one specific comment. */
export async function hasReportedComment(
  payload: Payload,
  userId: string,
  commentId: string
): Promise<boolean> {
  const result = await payload.db.drizzle.execute(sql`
    SELECT 1 AS id
    FROM content_reports_rels rels
    JOIN content_reports cr ON cr.id = rels.parent_id
    WHERE rels.path = 'reportedItem'
      AND rels.comments_id = ${commentId}
      AND cr.reported_by_id = ${userId}
    LIMIT 1
  `);

  return rowsOf(result).length > 0;
}

/** Whether the viewer has blocked one specific user. */
export async function hasBlockedUser(
  payload: Payload,
  userId: string,
  targetUserId: string
): Promise<boolean> {
  const result = await payload.db.drizzle.execute(sql`
    SELECT 1 AS id
    FROM users_rels
    WHERE path = 'blockedUsers'
      AND parent_id = ${userId}
      AND users_id = ${targetUserId}
    LIMIT 1
  `);

  return rowsOf(result).length > 0;
}

/**
 * Drizzle's postgres driver returns either an array of rows or a pg Result
 * with a `rows` property, depending on adapter version.
 */
function rowsOf(result: unknown): IdRow[] {
  if (Array.isArray(result)) {
    return result as IdRow[];
  }
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as IdRow[]) : [];
}

function extractIds(result: unknown): string[] {
  return rowsOf(result)
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
}
