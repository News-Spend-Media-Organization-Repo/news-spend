import { subDays } from "date-fns";
import type { Payload, Where } from "payload";

const PAGE_SIZE = 1000;

export const CONTACT_EXPORT_COLUMNS = [
  "name",
  "email",
  "country",
  "lastActive",
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

/**
 * Registered users who can be emailed, optionally only those who have not
 * opened the app for `inactiveDays`.
 *
 * Guests are left out: they have no address of their own. "Inactive" matches
 * the inactive-users push segment, so an account with no recorded activity at
 * all counts as dormant, not unknown (`lastActive` is null on every account
 * that predates it).
 */
export async function buildContactExport(
  payload: Payload,
  options: { inactiveDays?: number } = {}
): Promise<{ csv: string; count: number }> {
  const conditions: Where[] = [
    { email: { exists: true } },
    {
      or: [
        { isAnonymous: { exists: false } },
        { isAnonymous: { equals: false } },
      ],
    },
  ];

  if (options.inactiveDays && options.inactiveDays > 0) {
    const cutoff = subDays(new Date(), options.inactiveDays).toISOString();
    conditions.push({
      or: [
        { lastActive: { less_than: cutoff } },
        { lastActive: { exists: false } },
      ],
    });
  }

  const rows: Record<string, unknown>[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const result = await payload.find({
      collection: "users",
      where: { and: conditions },
      sort: "createdAt",
      limit: PAGE_SIZE,
      page,
      depth: 0,
      overrideAccess: true,
    });

    for (const user of result.docs) {
      const email = user.email?.trim();
      if (!email?.includes("@")) {
        continue;
      }
      rows.push({
        name: user.name,
        email,
        country: user.verifiedCountry ?? user.country,
        lastActive: user.lastActive,
        joined: user.createdAt,
      });
    }

    hasNext = result.hasNextPage;
    page += 1;
  }

  return { csv: toCsv(rows, CONTACT_EXPORT_COLUMNS), count: rows.length };
}
