import { describe, expect, test } from "bun:test";
import type { CollectionConfig, Config, Field } from "payload";
import { canSeeInternals } from "../src/access/adminRoles";
import { Partners } from "../src/collections/Partners";
import { internalsVisibilityPlugin } from "../src/plugins/internals-visibility";

const admin = (role: string) => ({ collection: "admins", role });

const ROLES = {
  superAdmin: admin("super-admin"),
  contentManager: admin("content-manager"),
  editor: admin("editor"),
  viewer: admin("viewer"),
  partner: admin("partner"),
  appUser: { collection: "users", role: "super-admin" },
};

describe("canSeeInternals", () => {
  test("is for super-admins and content managers only", () => {
    expect(canSeeInternals(ROLES.superAdmin)).toBe(true);
    expect(canSeeInternals(ROLES.contentManager)).toBe(true);
    for (const user of [ROLES.editor, ROLES.viewer, ROLES.partner]) {
      expect(canSeeInternals(user)).toBe(false);
    }
  });

  test("refuses an app user who carries an admin role, and nobody", () => {
    expect(canSeeInternals(ROLES.appUser)).toBe(false);
    expect(canSeeInternals(null)).toBe(false);
    expect(canSeeInternals(undefined)).toBe(false);
  });
});

const auditField = (condition?: unknown): Field =>
  ({
    name: "createdBy",
    type: "relationship",
    relationTo: ["admins"],
    admin: { condition: condition as never },
  }) as Field;

const run = (collections: CollectionConfig[]) => {
  const config = internalsVisibilityPlugin({
    collections,
    globals: [],
  } as unknown as Config) as Config;
  return config.collections ?? [];
};

type TabCondition = (args: Record<string, unknown>) => boolean;

const apiCondition = (collection: CollectionConfig): TabCondition => {
  const api = collection.admin?.components?.views?.edit?.api;
  const condition = api && "tab" in api ? api.tab?.condition : undefined;
  return condition as unknown as TabCondition;
};

describe("the API tab", () => {
  const [news] = run([
    { slug: "news", fields: [] } as unknown as CollectionConfig,
  ]);
  const condition = apiCondition(news as CollectionConfig);

  test("shows for roles trusted with internals, hides for the rest", () => {
    const shown = (user: unknown) =>
      condition({ collectionConfig: news, req: { user } });

    expect(shown(ROLES.superAdmin)).toBe(true);
    expect(shown(ROLES.contentManager)).toBe(true);
    expect(shown(ROLES.editor)).toBe(false);
    expect(shown(ROLES.viewer)).toBe(false);
    expect(shown(ROLES.partner)).toBe(false);
  });

  test("still honours hideAPIURL", () => {
    expect(
      condition({
        collectionConfig: { admin: { hideAPIURL: true } },
        req: { user: ROLES.superAdmin },
      })
    ).toBe(false);
  });

  test("keeps a custom API view a collection already had", () => {
    const [custom] = run([
      {
        slug: "x",
        fields: [],
        admin: {
          components: { views: { edit: { api: { Component: "x#Y" } } } },
        },
      } as unknown as CollectionConfig,
    ]);

    expect(custom?.admin?.components?.views?.edit?.api).toMatchObject({
      Component: "x#Y",
    });
  });
});

describe("the created-by and last-modified-by fields", () => {
  const conditionOf = (field: Field | undefined) =>
    (field as { admin: { condition: (...a: unknown[]) => boolean } }).admin
      .condition;

  test("show only to roles trusted with internals", () => {
    const [col] = run([
      { slug: "a", fields: [auditField()] } as unknown as CollectionConfig,
    ]);
    const condition = conditionOf(col?.fields[0]);

    expect(condition({}, {}, { user: ROLES.contentManager })).toBe(true);
    expect(condition({}, {}, { user: ROLES.editor })).toBe(false);
    expect(condition({}, {}, { user: ROLES.partner })).toBe(false);
  });

  test("still apply the plugin's own condition", () => {
    const [col] = run([
      {
        slug: "a",
        fields: [
          auditField(((data: { createdBy?: unknown }) =>
            Boolean(data.createdBy)) as never),
        ],
      } as unknown as CollectionConfig,
    ]);
    const condition = conditionOf(col?.fields[0]);

    expect(condition({}, {}, { user: ROLES.superAdmin })).toBe(false);
    expect(condition({ createdBy: "x" }, {}, { user: ROLES.superAdmin })).toBe(
      true
    );
  });

  test("leave other fields alone", () => {
    const title: Field = { name: "title", type: "text" };
    const [col] = run([
      { slug: "a", fields: [title] } as unknown as CollectionConfig,
    ]);

    expect(col?.fields[0]).toBe(title);
  });
});

describe("partners", () => {
  const can = (op: "create" | "update" | "delete", user: unknown) =>
    (Partners.access?.[op] as (a: { req: { user: unknown } }) => boolean)({
      req: { user },
    });

  test("only super-admins and content managers can change them", () => {
    for (const op of ["create", "update", "delete"] as const) {
      expect(can(op, ROLES.superAdmin)).toBe(true);
      expect(can(op, ROLES.contentManager)).toBe(true);
      for (const user of [ROLES.editor, ROLES.viewer, ROLES.partner]) {
        expect(can(op, user)).toBe(false);
      }
    }
  });

  test("a partner cannot read the internal integration settings", () => {
    const flat = (fields: Field[]): Field[] =>
      fields.flatMap((f) => ("fields" in f ? [f, ...flat(f.fields)] : [f]));
    const field = (name: string) =>
      flat(Partners.fields).find((f) => "name" in f && f.name === name);

    for (const name of ["awardOnClick", "confirmationDays"]) {
      const read = (field(name) as { access?: { read?: unknown } }).access
        ?.read as (a: { req: { user: unknown } }) => boolean;
      expect(read({ req: { user: ROLES.editor } })).toBe(true);
      expect(read({ req: { user: ROLES.partner } })).toBe(false);
    }
    // The guide a partner is given needs these two.
    for (const name of ["webhookUrl", "integrationMethod"]) {
      expect(
        (field(name) as { access?: unknown } | undefined)?.access
      ).toBeUndefined();
    }
  });
});
