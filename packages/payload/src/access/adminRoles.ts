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

/**
 * Read access for uploaded files: staff see all of them, a partner sees only
 * their own logo, and everyone else, signed out included, sees nothing.
 *
 * The collection also holds files reporters upload through iWitness, so a
 * listing of it is not something to hand out. Files are served from the CDN,
 * not through this rule, so closing the listing does not break images.
 */
export const readStaffOrOwnPartnerLogo = async ({
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
    const { logo } = await req.payload.findByID({
      collection: "partners",
      id: partnerId,
      depth: 0,
      select: { logo: true },
      req,
    });
    const logoId = typeof logo === "object" && logo !== null ? logo.id : logo;
    return logoId ? { id: { equals: logoId } } : false;
  } catch {
    // A partner record that cannot be loaded grants nothing.
    return false;
  }
};
