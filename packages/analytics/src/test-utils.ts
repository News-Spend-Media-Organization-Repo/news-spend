import { PgDialect } from "@payloadcms/db-postgres/drizzle/pg-core";

import type { AnalyticsDb } from "./db";
import { resolveRange } from "./range";
import { scopeFor } from "./scope";

export type Captured = { sql: string; params: unknown[] };

/**
 * A database that records each statement as Postgres would receive it: text
 * with $1-style placeholders, and the parameters apart. Asserting on those, not
 * on a stringified object, is what shows the partner id really is sent as a
 * bound value in the query it is meant to limit.
 */
export function stubDb(
  rows: unknown[] | ((query: Captured) => unknown[]) = []
): { db: AnalyticsDb; queries: Captured[] } {
  const dialect = new PgDialect();
  const queries: Captured[] = [];
  const db: AnalyticsDb = {
    execute: (query) => {
      const compiled = dialect.sqlToQuery(query);
      const captured = { sql: compiled.sql, params: compiled.params };
      queries.push(captured);
      return Promise.resolve({
        rows: typeof rows === "function" ? rows(captured) : rows,
      });
    },
  };
  return { db, queries };
}

export const NOW = new Date("2026-09-20T10:00:00Z");
export const range = (days = 7) => resolveRange({ days, now: NOW });

function required<T>(value: T | null): T {
  if (value === null) {
    throw new Error("fixture scope should exist");
  }
  return value;
}

export const STAFF = required(
  scopeFor({ collection: "admins", role: "editor" })
);
export const PARTNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const PARTNER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const PARTNER = required(
  scopeFor({ collection: "admins", role: "partner", partner: PARTNER_A })
);
export const ARTICLE = "11111111-1111-4111-8111-111111111111";
