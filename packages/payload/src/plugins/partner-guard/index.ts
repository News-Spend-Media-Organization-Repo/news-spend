import type {
  Access,
  CollectionConfig,
  GlobalConfig,
  Plugin,
  SanitizedConfig,
} from "payload";

import { isPartnerUser, isSuperAdmin } from "../../access/adminRoles";

type CollectionOperation =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "readVersions";
type GlobalOperation = "read" | "update" | "readVersions";

/**
 * The only collections a partner-role admin may touch, and how.
 *
 * Partners sign in to the same admin panel as staff. Payload's default for a
 * collection with no access rule is "any signed-in user", so without a guard
 * every collection that never declared one (users, comments, news, jobs...)
 * would be readable and writable by a partner. Guarding centrally, with an
 * allowlist, means a collection added next year is closed to partners until
 * someone opens it on purpose, rather than open until someone remembers to
 * close it.
 *
 * This only says which operations are reachable at all. Which rows a partner
 * sees is decided by the collection's own rule (`readOwnPartnerOrStaff`).
 */
export const PARTNER_ACCESS: Readonly<
  Record<string, readonly CollectionOperation[]>
> = {
  // Their own login record: the panel needs to read it, and a partner may
  // change their own password. Field rules stop them changing role/partner.
  admins: ["read", "update"],
  // Their own company record, its conversions and its store analytics.
  partners: ["read"],
  // Their own promotions (the rule on the collection limits it to their rows).
  "partner-content": ["read"],
  "partner-conversions": ["read"],
  "shop-analytics": ["read"],
  // Their logo and the files their own content uses.
  media: ["read"],
  // Payload's own bookkeeping, which the panel needs for any signed-in user.
  // Preferences are scoped to the owner by Payload itself. Document locks are
  // left on Payload's defaults because the edit view writes them; they name a
  // document and who holds it, nothing more.
  "payload-preferences": ["create", "read", "update", "delete"],
  "payload-locked-documents": ["create", "read", "update", "delete"],
};

/**
 * Readable by a partner but not something they browse. Media is here because
 * their partner record populates its logo through it; the list of every
 * uploaded file is not theirs to page through, so it stays out of the nav.
 */
const PARTNER_HIDDEN_FROM_NAV: ReadonlySet<string> = new Set(["media"]);

/**
 * Payload's own collections that no one but a super-admin should reach over
 * REST, partner or not.
 *
 * The migration ledger decides which migrations run on the next start. Payload
 * leaves it on "any signed-in user", so any staff account could add, edit or
 * delete rows and change what runs against production. The migration runner
 * itself talks to the database directly, not through this rule, so closing the
 * REST surface does not affect migrating.
 */
const SUPER_ADMIN_ONLY: ReadonlySet<string> = new Set(["payload-migrations"]);

const COLLECTION_OPERATIONS: readonly CollectionOperation[] = [
  "create",
  "read",
  "update",
  "delete",
  "readVersions",
];
const GLOBAL_OPERATIONS: readonly GlobalOperation[] = [
  "read",
  "update",
  "readVersions",
];

/** Payload's own default for an operation with no rule: any signed-in user. */
const signedIn: Access = ({ req: { user } }) => Boolean(user);

const denyPartner =
  (original: Access | undefined): Access =>
  (args) =>
    isPartnerUser(args.req.user) ? false : (original ?? signedIn)(args);

type HiddenArgs = { user: { collection?: string; role?: unknown } | null };

const hideFromPartner =
  <A extends HiddenArgs>(
    original: boolean | ((args: A) => boolean) | undefined
  ) =>
  (args: A): boolean =>
    isPartnerUser(args.user) ||
    (typeof original === "function" ? original(args) : Boolean(original));

/**
 * The access and navigation settings that close a collection to partner-role
 * admins for every operation not listed in `allowed`. Staff behaviour is
 * untouched: an existing rule still runs, and where there was none Payload's
 * default still applies.
 */
const collectionPatch = (
  collection: Pick<CollectionConfig, "slug" | "access" | "admin" | "versions">,
  allowed: readonly CollectionOperation[]
) => {
  const access = { ...collection.access };
  for (const operation of COLLECTION_OPERATIONS) {
    if (allowed.includes(operation)) {
      continue;
    }
    if (operation === "readVersions" && !collection.versions) {
      continue;
    }
    access[operation] = denyPartner(access[operation]);
  }

  return {
    access,
    // Hide what a partner cannot read, or does not browse, from their nav.
    admin:
      allowed.includes("read") && !PARTNER_HIDDEN_FROM_NAV.has(collection.slug)
        ? collection.admin
        : {
            ...collection.admin,
            hidden: hideFromPartner(collection.admin?.hidden),
          },
  };
};

/** Globals hold site-wide settings; a partner has no business in any of them. */
const globalPatch = (
  global: Pick<GlobalConfig, "access" | "admin" | "versions">
) => {
  const access = { ...global.access };
  for (const operation of GLOBAL_OPERATIONS) {
    if (operation === "readVersions" && !global.versions) {
      continue;
    }
    access[operation] = denyPartner(access[operation]);
  }

  return {
    access,
    admin: {
      ...global.admin,
      hidden: hideFromPartner(global.admin?.hidden),
    },
  };
};

export const guardCollection = (
  collection: CollectionConfig,
  allowed: readonly CollectionOperation[] = []
): CollectionConfig => ({
  ...collection,
  ...collectionPatch(collection, allowed),
});

export const guardGlobal = (global: GlobalConfig): GlobalConfig => ({
  ...global,
  ...globalPatch(global),
});

/**
 * Register last, so collections added by other plugins (the audit log, for
 * one) are guarded too.
 */
export const partnerGuardPlugin: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) =>
    guardCollection(collection, PARTNER_ACCESS[collection.slug])
  ),
  globals: config.globals?.map(guardGlobal),
});

/**
 * Guards the collections and globals Payload adds itself (`payload-*`).
 *
 * Payload appends these while sanitising the config, after every plugin has
 * run, so the plugin above never sees them, and only the jobs collection has
 * an override hook. Left alone they sit on the "any signed-in user" default,
 * which for a partner would include reading and rewriting the migration
 * ledger. They are patched in place so anything already holding a reference
 * to the sanitised config sees the change.
 */
export const guardInternalCollections = (
  config: SanitizedConfig
): SanitizedConfig => {
  for (const collection of config.collections) {
    if (collection.slug.startsWith("payload-")) {
      Object.assign(
        collection,
        collectionPatch(collection, PARTNER_ACCESS[collection.slug] ?? [])
      );
    }
    if (SUPER_ADMIN_ONLY.has(collection.slug)) {
      Object.assign(collection, {
        access: {
          ...collection.access,
          create: isSuperAdmin,
          read: isSuperAdmin,
          update: isSuperAdmin,
          delete: isSuperAdmin,
        },
      });
    }
  }
  for (const global of config.globals) {
    if (global.slug.startsWith("payload-")) {
      Object.assign(global, globalPatch(global));
    }
  }
  return config;
};
