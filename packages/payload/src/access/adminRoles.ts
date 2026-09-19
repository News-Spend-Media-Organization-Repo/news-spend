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
