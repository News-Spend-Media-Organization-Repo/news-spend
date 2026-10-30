import type { PayloadRequest, Where } from "payload";

type AccessArgs = { req: PayloadRequest };

/**
 * A signed-in admin whose role is `super-admin`.
 *
 * Checks the collection as well as the role, so a document from any other
 * auth collection can never pass on a `role` value it happens to carry.
 */
export const isSuperAdmin = ({ req: { user } }: AccessArgs): boolean =>
  user?.collection === "admins" && user.role === "super-admin";

/**
 * Roles trusted with the internals of the panel: who created or last changed a
 * record, the raw API view of a document, and a partner's integration setup.
 * Editors and viewers do day-to-day content work and do not need them.
 */
const INTERNALS_ROLES: readonly unknown[] = ["super-admin", "content-manager"];

/** Whether this user may see, and manage, the panel's internals. */
export const canSeeInternals = (
  user: { collection?: string; role?: unknown } | null | undefined
): boolean =>
  user?.collection === "admins" && INTERNALS_ROLES.includes(user.role);

/** `canSeeInternals` as a collection access rule. */
export const hasInternalsRole = ({ req: { user } }: AccessArgs): boolean =>
  canSeeInternals(user);

/** A signed-in admin whose role is `partner`. */
export const isPartnerUser = (
  user: { collection?: string; role?: unknown } | null | undefined
): boolean => user?.collection === "admins" && user.role === "partner";

/**
 * Internal staff: a signed-in admin who is not a partner.
 *
 * Partners sign in to the same admin panel, so "authenticated" no longer means
 * "one of us". Anything a partner must not see or change is gated on this.
 */
export const isStaff = ({ req: { user } }: AccessArgs): boolean =>
  user?.collection === "admins" && user.role !== "partner";

/**
 * Read access for data that belongs to a partner: staff see all of it, a
 * partner sees only rows whose `field` points at their own partner, and
 * everyone else sees nothing.
 *
 * A partner-role admin with no partner assigned matches nothing rather than
 * everything.
 */
export const readOwnPartnerOrStaff =
  (field: string) =>
  ({ req: { user } }: AccessArgs): boolean | Where => {
    if (user?.collection !== "admins") {
      return false;
    }
    if (user.role !== "partner") {
      return true;
    }

    const partner = user.partner;
    const partnerId =
      typeof partner === "object" && partner !== null ? partner.id : partner;

    return partnerId ? { [field]: { equals: partnerId } } : false;
  };

/** Upload fields in a partner's content that point at a media file. */
const MEDIA_KEYS: ReadonlySet<string> = new Set([
  "media",
  "video",
  "image",
  "thumbnail",
]);

/** Collects the ids held by upload fields, at any depth of a depth-0 document. */
const collectMediaIds = (value: unknown, ids: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMediaIds(item, ids);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        MEDIA_KEYS.has(key) &&
        (typeof item === "string" || typeof item === "number")
      ) {
        ids.add(String(item));
      } else {
        collectMediaIds(item, ids);
      }
    }
  }
};

/**
 * Read access for uploaded files: staff see all of them, a partner sees only
 * their own logo and the files used by their own content, and everyone else,
 * signed out included, sees nothing.
 *
 * The collection also holds files reporters upload through iWitness, so a
 * listing of it is not something to hand out. Files are served from the CDN,
 * not through this rule, so closing the listing does not break images; the
 * partner's own files are opened so the admin can preview them.
 */
export const readStaffOrOwnPartnerMedia = async ({
  req,
}: AccessArgs): Promise<boolean | Where> => {
  const { user } = req;
  if (user?.collection !== "admins") {
    return false;
  }
  if (user.role !== "partner") {
    return true;
  }

  const partner = user.partner;
  const partnerId =
    typeof partner === "object" && partner !== null ? partner.id : partner;
  if (!partnerId) {
    return false;
  }

  try {
    const ids = new Set<string>();

    const { logo } = await req.payload.findByID({
      collection: "partners",
      id: partnerId,
      depth: 0,
      select: { logo: true },
      req,
    });
    const logoId = typeof logo === "object" && logo !== null ? logo.id : logo;
    collectMediaIds({ media: logoId }, ids);

    const content = await req.payload.find({
      collection: "partner-content",
      where: { partner: { equals: partnerId } },
      depth: 0,
      pagination: false,
      select: { media: true, video: true, items: true },
      req,
    });
    collectMediaIds(content.docs, ids);

    return ids.size > 0 ? { id: { in: [...ids] } } : false;
  } catch {
    // A partner record that cannot be loaded grants nothing.
    return false;
  }
};
