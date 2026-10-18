import type { CollectionConfig, Field } from "payload";
import { describe, expect, test } from "vitest";

import * as collections from "../index";

/**
 * The Payload REST and GraphQL APIs are public on the CMS domain, and a rule
 * that returns true for a signed-out request is open to the whole internet.
 * These are the only collections anyone may read without signing in; every
 * other collection must refuse, and no collection may accept anonymous writes.
 */
const ANONYMOUS_READ_ALLOWED = new Set([
  "categories",
  "news", // published only, see authenticatedOrPublished
  "partner-content",
  "promotion-media",
  "stores",
]);

const OPERATIONS = ["read", "create", "update", "delete"] as const;

const all = Object.values(collections).filter(
  (value): value is CollectionConfig =>
    typeof value === "object" && value !== null && "slug" in value
);

const anonymous = { req: { user: null, headers: new Headers() } } as never;
const superAdmin = {
  req: { user: { collection: "admins", role: "super-admin" } },
} as never;

/** No rule means Payload's default: any signed-in user, so not anonymous. */
const anonymousResult = async (
  collection: CollectionConfig,
  operation: (typeof OPERATIONS)[number]
) => {
  const rule = collection.access?.[operation];
  if (rule === undefined) {
    return false;
  }
  return await rule(anonymous);
};

const fieldNamed = (collection: CollectionConfig, name: string) =>
  collection.fields.find(
    (field: Field) => "name" in field && field.name === name
  );

describe("anonymous access over the public Payload API", () => {
  test("finds the collections", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  for (const collection of all) {
    for (const operation of ["create", "update", "delete"] as const) {
      test(`${collection.slug}: anonymous ${operation} is refused`, async () => {
        expect(await anonymousResult(collection, operation)).toBe(false);
      });
    }

    if (!ANONYMOUS_READ_ALLOWED.has(collection.slug)) {
      test(`${collection.slug}: anonymous read is refused`, async () => {
        expect(await anonymousResult(collection, "read")).toBe(false);
      });
    }
  }

  test("published news is the only news an anonymous reader sees", async () => {
    expect(await anonymousResult(collections.News, "read")).toEqual({
      _status: { equals: "published" },
    });
  });
});

describe("BetterAuth secrets are never readable through Payload", () => {
  const secrets: [CollectionConfig, string][] = [
    [collections.Account, "password"],
    [collections.Account, "idToken"],
    [collections.Account, "accessToken"],
    [collections.Account, "refreshToken"],
    [collections.Session, "token"],
    [collections.Verification, "value"],
  ];

  for (const [collection, name] of secrets) {
    test(`${collection.slug}.${name} is hidden, even from a super-admin`, async () => {
      const field = fieldNamed(collection, name);
      const read = field && "access" in field ? field.access?.read : undefined;
      expect(read).toBeFunction();
      expect(await read?.(superAdmin)).toBe(false);
    });
  }
});
