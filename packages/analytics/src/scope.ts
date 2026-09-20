/**
 * Who a query is being run for, and therefore what it may return.
 *
 * Every query in this package takes a scope as a required argument and decides
 * from it what to read, so there is no way to ask for a number without saying
 * whose eyes it is for. A scope is built from the signed-in user by `scopeFor`
 * and by nothing else: the brand below means an object written out by hand does
 * not type-check as one.
 *
 * The rules are the ones the admin panel's access layer already applies:
 * staff are admins who are not partners, a partner is an admin with the
 * partner role, and anyone else has no scope at all.
 */
declare const scopeBrand: unique symbol;

export type StaffScope = {
  readonly kind: "staff";
  readonly [scopeBrand]: true;
};

export type PartnerScope = {
  readonly kind: "partner";
  readonly partnerId: string;
  readonly [scopeBrand]: true;
};

export type AnalyticsScope = StaffScope | PartnerScope;

/** Thrown when a scope is asked for something it is not allowed to see. */
export class AnalyticsAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsAccessError";
  }
}

/** The parts of a signed-in user this needs; an `admins` document fits. */
export type ScopeUser = {
  collection?: string;
  role?: unknown;
  partner?: string | number | { id: string | number } | null;
};

const staffScope = Object.freeze({ kind: "staff" }) as StaffScope;

/**
 * The scope for a signed-in user, or `null` when they have none.
 *
 * `null` means "show nothing", and callers must treat it that way. In
 * particular a partner account with no partner assigned is `null`, not staff:
 * an unfinished setup must never widen what someone can see.
 */
export function scopeFor(
  user: ScopeUser | null | undefined
): AnalyticsScope | null {
  if (user?.collection !== "admins") {
    return null;
  }
  if (user.role !== "partner") {
    return staffScope;
  }

  const partner = user.partner;
  const id =
    typeof partner === "object" && partner !== null ? partner.id : partner;
  if (id === undefined || id === null || id === "") {
    return null;
  }

  return Object.freeze({
    kind: "partner",
    partnerId: String(id),
  }) as PartnerScope;
}

/** Stops a partner from reading data that is not partner-specific. */
export function requireStaff(
  scope: AnalyticsScope
): asserts scope is StaffScope {
  if (scope.kind !== "staff") {
    throw new AnalyticsAccessError("This report is for staff only.");
  }
}

/**
 * The partner a query must be limited to.
 *
 * A partner is always limited to their own, whatever they ask for; asking for
 * someone else's is an error, not a quietly corrected request, so a probing
 * client gets told no. Staff get what they asked for, or `undefined` meaning
 * every partner.
 */
export function partnerFilter(
  scope: AnalyticsScope,
  requested?: string
): string | undefined {
  if (scope.kind === "staff") {
    return requested;
  }
  if (requested !== undefined && requested !== scope.partnerId) {
    throw new AnalyticsAccessError("You can only see your own partner's data.");
  }
  return scope.partnerId;
}
