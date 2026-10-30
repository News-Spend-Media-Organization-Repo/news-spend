import type {
  Access,
  CollectionConfig,
  GlobalConfig,
  Plugin,
  SanitizedConfig,
} from "payload";

import { canSeeInternals } from "../../access/adminRoles";

/**
 * Who may change things, by role.
 *
 * Payload's default for an operation with no rule is "any signed-in admin", and
 * most collections here only declare `read`. Left alone, the `viewer` role (the
 * default for a new admin) could publish news and award points. Deciding it
 * centrally means a collection added next year is covered until someone opens
 * it on purpose, as the partner guard does for partners.
 *
 * - A viewer is read-only on every collection and global, their own admin
 *   record included (a forgotten password is reset by email, which does not go
 *   through this rule). The one exception is Payload's per-user panel
 *   preferences: column choices and the like, scoped by Payload to the owner.
 * - The points and prize economy is for the roles trusted with the panel's
 *   internals (super-admin and content-manager). Editors keep content and
 *   moderation.
 *
 * Existing rules still run: this only narrows who reaches them.
 */
export const ECONOMY_COLLECTIONS: ReadonlySet<string> = new Set([
  "activities",
  "survey",
  "giveaways",
  "giveaway-prizes",
  "giveaway-winners",
  "giveaway-tickets",
  "giveaway-streaks",
  "giveaway-engagements",
  "giveaway-account-flags",
  "prize-catalogue",
  "partner-conversions",
]);

/** Payload's own bookkeeping that a viewer still needs: their panel settings. */
const VIEWER_WRITABLE: ReadonlySet<string> = new Set(["payload-preferences"]);

type RoleUser = { collection?: string; role?: unknown } | null | undefined;

const isViewer = (user: RoleUser): boolean =>
  user?.collection === "admins" && user.role === "viewer";

/** Payload's own default for an operation with no rule: any signed-in user. */
const signedIn: Access = ({ req: { user } }) => Boolean(user);

const onlyWhen =
  (
    allowed: (user: RoleUser) => boolean,
    original: Access | undefined
  ): Access =>
  (args) =>
    allowed(args.req.user) ? (original ?? signedIn)(args) : false;

const WRITE_OPERATIONS = ["create", "update", "delete"] as const;

export const guardCollectionWrites = (
  collection: CollectionConfig
): CollectionConfig => {
  const economy = ECONOMY_COLLECTIONS.has(collection.slug);
  if (!economy && VIEWER_WRITABLE.has(collection.slug)) {
    return collection;
  }
  const allowed = economy
    ? canSeeInternals
    : (user: RoleUser) => !isViewer(user);

  const access = { ...collection.access };
  for (const operation of WRITE_OPERATIONS) {
    access[operation] = onlyWhen(allowed, access[operation]);
  }
  return { ...collection, access };
};

export const guardGlobalWrites = (global: GlobalConfig): GlobalConfig => ({
  ...global,
  access: {
    ...global.access,
    update: onlyWhen((user) => !isViewer(user), global.access?.update),
  },
});

/**
 * The same rule for the collections and globals Payload adds itself
 * (`payload-*`), which appear while the config is sanitised, after every plugin
 * has run. Patched in place so anything holding the sanitised config sees it.
 * Payload writes document locks straight to the database, so closing them over
 * REST does not affect opening a document.
 */
export const guardInternalWrites = (
  config: SanitizedConfig
): SanitizedConfig => {
  for (const collection of config.collections) {
    if (collection.slug.startsWith("payload-")) {
      Object.assign(collection, guardCollectionWrites(collection));
    }
  }
  for (const global of config.globals) {
    if (global.slug.startsWith("payload-")) {
      Object.assign(global, guardGlobalWrites(global));
    }
  }
  return config;
};

/** Register after the plugins that add collections, so they are covered too. */
export const roleGuardPlugin: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map(guardCollectionWrites),
  globals: config.globals?.map(guardGlobalWrites),
});
