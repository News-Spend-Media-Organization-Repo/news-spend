import { beforeAll, describe, expect, test } from "bun:test";
import type { Access, CollectionConfig, SanitizedConfig } from "payload";

import {
  guardCollection,
  guardGlobal,
  PARTNER_ACCESS,
} from "../src/plugins/partner-guard";

/**
 * Partners sign in to the same admin panel as staff, and Payload's default for
 * a collection with no access rule is "any signed-in user". Without the guard
 * a partner login could read the users table or edit any article. The final
 * test builds the real config, so a collection added later cannot slip past
 * unnoticed.
 */

const args = (user: Record<string, unknown> | null) =>
  ({ req: { user } }) as unknown as Parameters<Access>[0];

const partner = {
  collection: "admins",
  id: "p-1",
  role: "partner",
  partner: "partner-a",
};
const staff = { collection: "admins", id: "s-1", role: "editor" };

describe("guardCollection", () => {
  test("a partner is denied every operation not on the allowlist", async () => {
    const guarded = guardCollection({ slug: "notes", fields: [] });
    for (const op of ["create", "read", "update", "delete"] as const) {
      expect(await guarded.access?.[op]?.(args(partner))).toBe(false);
    }
  });

  test("staff keep Payload's signed-in default where no rule existed", async () => {
    const guarded = guardCollection({ slug: "notes", fields: [] });
    expect(await guarded.access?.read?.(args(staff))).toBe(true);
    expect(await guarded.access?.read?.(args(null))).toBe(false);
  });

  test("an existing rule still decides for staff", async () => {
    const guarded = guardCollection({
      slug: "notes",
      fields: [],
      access: { read: () => false, update: () => true },
    });
    expect(await guarded.access?.read?.(args(staff))).toBe(false);
    expect(await guarded.access?.update?.(args(staff))).toBe(true);
  });

  test("an allowed operation keeps the collection's own rule", async () => {
    const own = () => ({ id: { equals: "p-1" } });
    const guarded = guardCollection(
      { slug: "notes", fields: [], access: { read: own } },
      ["read"]
    );
    expect(await guarded.access?.read?.(args(partner))).toEqual(own());
    expect(await guarded.access?.update?.(args(partner))).toBe(false);
  });

  test("hides a closed collection from a partner's navigation only", () => {
    const guarded = guardCollection({ slug: "notes", fields: [] });
    const hidden = guarded.admin?.hidden;
    expect(typeof hidden).toBe("function");
    if (typeof hidden === "function") {
      expect(hidden({ user: partner } as never)).toBe(true);
      expect(hidden({ user: staff } as never)).toBe(false);
    }
  });

  test("keeps a collection that was already hidden hidden for staff", () => {
    const guarded = guardCollection({
      slug: "notes",
      fields: [],
      admin: { hidden: true },
    });
    const hidden = guarded.admin?.hidden;
    if (typeof hidden === "function") {
      expect(hidden({ user: staff } as never)).toBe(true);
    }
  });

  test("does not touch readVersions on a collection without versions", () => {
    const guarded = guardCollection({ slug: "notes", fields: [] });
    expect(guarded.access?.readVersions).toBeUndefined();
  });
});

describe("guardGlobal", () => {
  test("a partner is denied every operation", async () => {
    const guarded = guardGlobal({ slug: "settings", fields: [] });
    expect(await guarded.access?.read?.(args(partner))).toBe(false);
    expect(await guarded.access?.update?.(args(partner))).toBe(false);
    expect(await guarded.access?.read?.(args(staff))).toBe(true);
  });
});

describe("the built config", () => {
  let config: SanitizedConfig;

  beforeAll(async () => {
    // buildConfig requires a secret; nothing here connects to a database.
    process.env.PAYLOAD_SECRET ??= "test-secret";
    const built = await import("../src/payload.config");
    config = await built.default;
  });

  test("every collection outside the allowlist is closed to a partner", async () => {
    const operations = ["create", "read", "update", "delete"] as const;
    const open: string[] = [];

    for (const collection of config.collections as CollectionConfig[]) {
      const allowed: readonly string[] = PARTNER_ACCESS[collection.slug] ?? [];
      for (const op of operations) {
        if (allowed.includes(op)) {
          continue;
        }
        const result = await collection.access?.[op]?.(args(partner));
        if (result !== false) {
          open.push(`${collection.slug}.${op}`);
        }
      }
    }

    expect(open).toEqual([]);
  });

  test("the allowlist names collections that exist", () => {
    const slugs = new Set(config.collections.map((c) => c.slug));
    for (const slug of Object.keys(PARTNER_ACCESS)) {
      expect(slugs.has(slug as never)).toBe(true);
    }
  });

  test("every global is closed to a partner", async () => {
    for (const global of config.globals) {
      expect(await global.access?.read?.(args(partner))).toBe(false);
      expect(await global.access?.update?.(args(partner))).toBe(false);
    }
  });

  test("a partner cannot reach the mobile users, comments or news over REST", async () => {
    const bySlug = new Map(
      (config.collections as CollectionConfig[]).map((c) => [c.slug, c])
    );
    for (const slug of ["users", "comments", "news", "audit-logs"]) {
      const collection = bySlug.get(slug);
      if (collection) {
        expect(await collection.access?.read?.(args(partner))).toBe(false);
      }
    }
  });
});
