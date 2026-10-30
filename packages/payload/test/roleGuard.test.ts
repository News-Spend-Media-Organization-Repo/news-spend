import { beforeAll, describe, expect, test } from "bun:test";
import type {
  Access,
  CollectionConfig,
  Config,
  GlobalConfig,
  SanitizedConfig,
} from "payload";
import { adminOnly, hasRole } from "../src/access/hasRole";
import * as barrel from "../src/collections";
import UserBlocks from "../src/collections/UserBlocks";
import ModerationSettings from "../src/globals/ModerationSettings";
import NewsCategory from "../src/globals/NewsCategory";
import SurveySettings from "../src/globals/SurveySettings";
import {
  ECONOMY_COLLECTIONS,
  roleGuardPlugin,
} from "../src/plugins/role-guard";

const admin = (role: string) => ({ collection: "admins", role });
const ROLES = {
  superAdmin: admin("super-admin"),
  contentManager: admin("content-manager"),
  editor: admin("editor"),
  viewer: admin("viewer"),
};

const collections = [...Object.values(barrel), UserBlocks].filter(
  (value): value is CollectionConfig =>
    typeof value === "object" &&
    value !== null &&
    "slug" in value &&
    "fields" in value
);
const globals: GlobalConfig[] = [
  NewsCategory,
  ModerationSettings,
  SurveySettings,
];

const guarded = roleGuardPlugin({ collections, globals } as Config) as Config;
const guardedCollections = guarded.collections ?? [];
const guardedGlobals = guarded.globals ?? [];

const OPERATIONS = ["create", "update", "delete"] as const;

/** What an operation answers a user: false is a refusal, anything else a yes. */
const answer = async (access: Access | undefined, user: unknown) => {
  if (!access) {
    return Boolean(user);
  }
  const result = await access({
    req: { user, payload: {} },
    id: "x",
    data: {},
  } as never);
  return result !== false;
};

const find = (slug: string) =>
  guardedCollections.find((collection) => collection.slug === slug);

describe("a viewer", () => {
  test("is read-only on every collection, their own admin record included", async () => {
    const writable: string[] = [];
    for (const collection of guardedCollections) {
      for (const operation of OPERATIONS) {
        if (await answer(collection.access?.[operation], ROLES.viewer)) {
          writable.push(`${collection.slug}.${operation}`);
        }
      }
    }
    expect(writable).toEqual([]);
  });

  test("cannot change a global", async () => {
    for (const global of guardedGlobals) {
      expect(await answer(global.access?.update, ROLES.viewer)).toBe(false);
    }
  });

  test("keeps the read access they had", async () => {
    for (const collection of guardedCollections) {
      const before = collections.find((c) => c.slug === collection.slug);
      expect(await answer(collection.access?.read, ROLES.viewer)).toBe(
        await answer(before?.access?.read, ROLES.viewer)
      );
    }
  });
});

describe("an editor", () => {
  test("keeps content and moderation", async () => {
    for (const slug of [
      "news",
      "media",
      "comments",
      "categories",
      "contentReports",
    ]) {
      for (const operation of OPERATIONS) {
        const before = collections.find((c) => c.slug === slug);
        expect(
          await answer(find(slug)?.access?.[operation], ROLES.editor)
        ).toBe(await answer(before?.access?.[operation], ROLES.editor));
      }
    }
    expect(await answer(find("news")?.access?.create, ROLES.editor)).toBe(true);
  });
});

describe("the points and prize economy", () => {
  test("covers the collections it should", () => {
    for (const slug of ECONOMY_COLLECTIONS) {
      expect(find(slug)).toBeDefined();
    }
    expect(ECONOMY_COLLECTIONS.has("activities")).toBe(true);
    expect(ECONOMY_COLLECTIONS.has("giveaways")).toBe(true);
  });

  test("is writable by super-admins and content managers only", async () => {
    for (const slug of ECONOMY_COLLECTIONS) {
      const collection = find(slug);
      const before = collections.find((c) => c.slug === slug);
      for (const operation of OPERATIONS) {
        // Where the collection already refused an operation, it still does.
        const open = await answer(
          before?.access?.[operation],
          ROLES.superAdmin
        );
        const rule = collection?.access?.[operation];

        expect(await answer(rule, ROLES.superAdmin)).toBe(open);
        expect(await answer(rule, ROLES.contentManager)).toBe(open);
        expect(await answer(rule, ROLES.editor)).toBe(false);
        expect(await answer(rule, ROLES.viewer)).toBe(false);
      }
    }
  });

  test("is still readable by every staff role", async () => {
    for (const slug of ECONOMY_COLLECTIONS) {
      for (const user of Object.values(ROLES)) {
        const before = collections.find((c) => c.slug === slug);
        expect(await answer(find(slug)?.access?.read, user)).toBe(
          await answer(before?.access?.read, user)
        );
      }
    }
  });
});

describe("hasRole", () => {
  const check = (access: Access, user: unknown) =>
    access({ req: { user } } as never);

  test("needs the admins collection as well as the role", () => {
    expect(check(adminOnly, ROLES.superAdmin)).toBe(true);
    expect(check(adminOnly, ROLES.contentManager)).toBe(false);
    expect(check(adminOnly, { collection: "users", role: "super-admin" })).toBe(
      false
    );
    expect(check(adminOnly, null)).toBe(false);
    expect(check(hasRole("editor"), ROLES.editor)).toBe(true);
  });
});

describe("the built config", () => {
  let built: SanitizedConfig;

  beforeAll(async () => {
    // buildConfig requires a secret; nothing here connects to a database.
    process.env.PAYLOAD_SECRET ??= "test-secret";
    built = await (await import("../src/payload.config")).default;
  });

  test("a viewer can write nothing but their own panel preferences", async () => {
    const writable: string[] = [];
    for (const collection of built.collections as CollectionConfig[]) {
      for (const operation of OPERATIONS) {
        if (await answer(collection.access?.[operation], ROLES.viewer)) {
          writable.push(`${collection.slug}.${operation}`);
        }
      }
    }
    for (const global of built.globals as GlobalConfig[]) {
      if (await answer(global.access?.update, ROLES.viewer)) {
        writable.push(`${global.slug}.update`);
      }
    }

    expect(
      writable.filter((entry) => !entry.startsWith("payload-preferences."))
    ).toEqual([]);
  });

  test("a viewer's preferences stay scoped to their own rows", async () => {
    const preferences = (built.collections as CollectionConfig[]).find(
      (collection) => collection.slug === "payload-preferences"
    );
    const viewer = { ...ROLES.viewer, id: "v1" };
    const result = await preferences?.access?.update?.({
      req: { user: viewer, payload: {} },
    } as never);

    expect(JSON.stringify(result)).toContain("v1");
  });

  test("an editor can still write content and a content manager the economy", async () => {
    const get = (slug: string) =>
      (built.collections as CollectionConfig[]).find((c) => c.slug === slug);

    expect(await answer(get("news")?.access?.update, ROLES.editor)).toBe(true);
    expect(await answer(get("giveaways")?.access?.update, ROLES.editor)).toBe(
      false
    );
    expect(
      await answer(get("giveaways")?.access?.update, ROLES.contentManager)
    ).toBe(true);
  });
});
