import type { SQL } from "@payloadcms/db-postgres/drizzle";

/**
 * The only thing the reports need from a database: run a statement, get rows
 * back. Payload's `payload.db.drizzle` satisfies it, and so does a stub in a
 * test, which is why the queries never import Payload.
 */
export type AnalyticsDb = {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
};

/** Runs a query and returns its rows as `T`. The SELECT decides the shape. */
export async function rowsOf<T>(db: AnalyticsDb, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as T[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Refuses anything that is not a UUID before it reaches the database, so a bad
 * id in a URL is a clear error here rather than a Postgres one.
 */
export function assertUuid(value: string, label: string): string {
  if (!UUID.test(value)) {
    throw new RangeError(`${label} must be a UUID`);
  }
  return value;
}

/** A timestamp from the driver, as an ISO string, or `null` when it is empty. */
export function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" && value !== ""
    ? new Date(value).toISOString()
    : null;
}

/** `part / whole` as a percentage to one decimal, or `null` when `whole` is 0. */
export function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}
