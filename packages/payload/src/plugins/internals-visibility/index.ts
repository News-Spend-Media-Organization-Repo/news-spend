import type { CollectionConfig, Field, GlobalConfig, Plugin } from "payload";

import { canSeeInternals } from "../../access/adminRoles";

/**
 * Hides the panel's internals from roles that have no use for them: the API
 * tab on every document, and the "created by" / "last modified by" fields the
 * audit-fields plugin adds.
 *
 * This is about what the panel shows. The REST API still answers anyone who
 * may read a collection, so it is not a data-access rule. Register it after
 * the audit-fields plugin, so the fields it adds exist to be wrapped.
 */
const AUDIT_FIELD_NAMES: ReadonlySet<string> = new Set([
  "createdBy",
  "lastModifiedBy",
]);

type AdminConfig = NonNullable<CollectionConfig["admin"]>;
type GlobalAdminConfig = NonNullable<GlobalConfig["admin"]>;

const withApiTab = <A extends AdminConfig | GlobalAdminConfig>(
  admin: A | undefined
): A => {
  const views = admin?.components?.views;
  const api = views?.edit?.api;

  return {
    ...admin,
    components: {
      ...admin?.components,
      views: {
        ...views,
        edit: {
          ...views?.edit,
          api: {
            ...api,
            tab: {
              ...(api && "tab" in api ? api.tab : undefined),
              // A custom `tab` replaces Payload's own condition, so its
              // "unless hideAPIURL" check is repeated here.
              condition: ({ collectionConfig, globalConfig, req }) =>
                !(collectionConfig ?? globalConfig)?.admin?.hideAPIURL &&
                canSeeInternals(req.user),
            },
          },
        },
      },
    },
  } as A;
};

const guardAuditFields = (fields: Field[]): Field[] =>
  fields.map((field): Field => {
    if (field.type !== "relationship" || !AUDIT_FIELD_NAMES.has(field.name)) {
      return field;
    }
    const original = field.admin?.condition;
    return {
      ...field,
      admin: {
        ...field.admin,
        condition: (data, siblingData, ctx) =>
          canSeeInternals(ctx.user) &&
          (original ? original(data, siblingData, ctx) : true),
      },
    } as Field;
  });

export const internalsVisibilityPlugin: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map(
    (collection): CollectionConfig => ({
      ...collection,
      admin: withApiTab(collection.admin),
      fields: guardAuditFields(collection.fields),
    })
  ),
  globals: config.globals?.map(
    (global): GlobalConfig => ({
      ...global,
      admin: withApiTab(global.admin),
      fields: guardAuditFields(global.fields),
    })
  ),
});
