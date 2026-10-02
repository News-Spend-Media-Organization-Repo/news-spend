import { sql } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

export const CONTACT_EXPORT_COLUMNS = [
  "name",
  "email",
  "country",
  "lastSeen",
  "lastSeenFrom",
  "joined",
] as const;

/**
 * One CSV cell.
 *
 * Names are typed by users, and a spreadsheet treats a cell starting with `=`,
 * `+`, `-`, `@` (or a tab/CR) as a formula, so an exported name like
 * `=HYPERLINK(...)` would execute when an administrator opens the file. A
 * leading apostrophe makes the spreadsheet show it as text.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  rows: Record<string, unknown>[],
  columns: readonly string[]
) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

type Db = Payload["db"]["drizzle"];

/**
 * When we last saw this person, from the best evidence we have.
 *
 * `users.lastActive` is only written from the point the activity middleware
 * shipped, so every account that has not used the app since then holds null,
 * even if they used it last month. Treating null as "never" would put recently
 * active people on a dormant list, and treating it as "dormant" does the same.
 * So the answer is the latest of three things:
 *
 *  1. `last_active`: the app's own activity record (most precise).
 *  2. the newest login session: Better Auth refreshes it as the app is used,
 *     and it reaches back before `last_active` existed.
 *  3. `created_at`: signing up is itself a sign of life, and guarantees every
 *     account has a date.
 *
 * `lastSeenFrom` says which one won, so whoever reads the file knows how much
 * to trust a date. A session is refreshed at most weekly, so it can be up to
 * about a week behind.
 */
const LAST_SEEN = sql`GREATEST(u.last_active, s.last_session, u.created_at)`;

const LAST_SEEN_FROM = sql`CASE
  WHEN u.last_active IS NOT NULL
    AND u.last_active >= COALESCE(s.last_session, u.last_active)
    AND u.last_active >= u.created_at THEN 'app activity'
  WHEN s.last_session IS NOT NULL
    AND s.last_session >= u.created_at THEN 'login session'
  ELSE 'sign-up' END`;

const CONTACTS_FROM = sql`FROM users u
  LEFT JOIN (
    SELECT user_id, MAX(updated_at) AS last_session
    FROM sessions
    GROUP BY user_id
  ) s ON s.user_id = u.id::text
  WHERE u.email IS NOT NULL
    AND POSITION('@' IN u.email) > 1
    AND u.is_anonymous IS NOT TRUE`;

const rowsOf = <T>(result: unknown): T[] =>
  ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/** How many people could be emailed, and how many of them are dormant. */
export async function countContacts(
  db: Db,
  windows: readonly number[]
): Promise<{ total: number; inactive: Record<number, number> }> {
  if (windows.length === 0) {
    throw new Error("countContacts needs at least one window");
  }
  const columns = windows.map(
    (days, i) =>
      sql`COUNT(*) FILTER (WHERE ${LAST_SEEN} < now() - make_interval(days => ${days}))::int AS ${sql.raw(`d${i}`)}`
  );
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS total, ${sql.join(columns, sql`, `)} ${CONTACTS_FROM}`
  );
  const [row] = rowsOf<Record<string, number>>(result);
  return {
    total: row?.total ?? 0,
    inactive: Object.fromEntries(
      windows.map((days, i) => [days, row?.[`d${i}`] ?? 0])
    ),
  };
}

/**
 * Registered users who can be emailed, optionally only those not seen for
 * `inactiveDays` (see {@link LAST_SEEN}). Guests are left out: they have no
 * address of their own.
 */
export async function buildContactExport(
  payload: Payload,
  options: { inactiveDays?: number } = {}
): Promise<{ csv: string; count: number }> {
  const days = Math.floor(options.inactiveDays ?? 0);
  const filter =
    days > 0
      ? sql` AND ${LAST_SEEN} < now() - make_interval(days => ${days})`
      : sql``;

  const result = await payload.db.drizzle.execute(
    sql`SELECT
        u.name AS "name",
        u.email AS "email",
        COALESCE(u.verified_country, u.country) AS "country",
        to_char(${LAST_SEEN} AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "lastSeen",
        ${LAST_SEEN_FROM} AS "lastSeenFrom",
        to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "joined"
      ${CONTACTS_FROM}${filter}
      ORDER BY ${LAST_SEEN} ASC, u.created_at ASC`
  );

  const rows = rowsOf<Record<string, unknown>>(result);
  return { csv: toCsv(rows, CONTACT_EXPORT_COLUMNS), count: rows.length };
}
