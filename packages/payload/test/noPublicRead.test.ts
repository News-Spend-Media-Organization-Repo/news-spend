import { describe, expect, test } from "bun:test";
import type { Access, CollectionConfig, GlobalConfig } from "payload";
import * as barrel from "../src/collections";
import { PushTokens, VerificationOTP } from "../src/collections";
import NewsCategory from "../src/globals/NewsCategory";

const collections = Object.values(barrel).filter(
  (value): value is CollectionConfig =>
    typeof value === "object" &&
    value !== null &&
    "slug" in value &&
    "fields" in value
);

const admin = (role: string) => ({ collection: "admins", role });

const read = async (access: Access | undefined, user: unknown) => {
  if (!access) {
    // No rule: Payload's default, which needs a signed-in user.
    return Boolean(user);
  }
  return await access({ req: { user, payload: {} } } as never);
};

describe("no collection is readable without signing in", () => {
  test("covers the collections it should", () => {
    expect(collections.length).toBeGreaterThan(30);
  });

  // App users cannot hold a Payload session (the users collection is not an
  // auth collection), so an anonymous request is the one to guard against.
  test("an anonymous request never gets unconditional access", async () => {
    const open: string[] = [];
    for (const collection of collections) {
      const result = await read(collection.access?.read, null).catch(
        () => false
      );
      if (result === true) {
        open.push(collection.slug);
      }
    }
    expect(open).toEqual([]);
  });

  test("the news-category global is not open either", async () => {
    const global = NewsCategory as GlobalConfig;
    expect(await read(global.access?.read, null)).toBe(false);
    expect(await read(global.access?.read, admin("editor"))).toBe(true);
  });
});

describe("secrets and tokens", () => {
  for (const collection of [PushTokens, VerificationOTP]) {
    test(`${collection.slug} is for super-admins only`, async () => {
      for (const op of ["create", "read", "update", "delete"] as const) {
        const access = collection.access?.[op] as Access;
        expect(await read(access, admin("super-admin"))).toBe(true);
        for (const role of ["content-manager", "editor", "viewer", "partner"]) {
          expect(await read(access, admin(role))).toBe(false);
        }
      }
    });
  }
});
