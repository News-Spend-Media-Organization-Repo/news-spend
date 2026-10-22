import { describe, expect, test } from "bun:test";
import type { Access, FieldAccess, PayloadRequest } from "payload";

import {
  isStaff,
  isSuperAdmin,
  readOwnPartnerOrStaff,
} from "../src/access/adminRoles";
import Admins from "../src/collections/Admins";
import { Media } from "../src/collections/Media";
import NewsAnalytics from "../src/collections/NewsAnalytics";
import { PartnerConversions } from "../src/collections/PartnerConversions";
import ShopAnalytics from "../src/collections/ShopAnalytics";
import WitnessReport from "../src/collections/WitnessReport";

/**
 * These rules decide what a partner who signs in to the admin panel, or an
 * anonymous caller of the REST API, can read or change. A regression would not
 * fail loudly: it would just quietly expose another partner's numbers or let
 * an account promote itself, so each rule is pinned here.
 */

type TestUser = {
  collection: string;
  id: string;
  role?: string;
  partner?: string | { id: string } | null;
};

const reqFor = (user: TestUser | null) =>
  ({ req: { user } }) as unknown as Parameters<Access>[0] &
    Parameters<FieldAccess>[0] & { req: PayloadRequest };

const admin = (role: string, extra: Partial<TestUser> = {}): TestUser => ({
  collection: "admins",
  id: `${role}-1`,
  role,
  ...extra,
});

const superAdmin = admin("super-admin");
const editor = admin("editor");
const partner = admin("partner", { partner: "partner-a" });

// A document from any other collection that happens to carry a role value.
const impostor: TestUser = {
  collection: "users",
  id: "user-1",
  role: "super-admin",
};

describe("isSuperAdmin", () => {
  test("passes only a super-admin admin", () => {
    expect(isSuperAdmin(reqFor(superAdmin))).toBe(true);
    expect(isSuperAdmin(reqFor(editor))).toBe(false);
    expect(isSuperAdmin(reqFor(partner))).toBe(false);
    expect(isSuperAdmin(reqFor(null))).toBe(false);
  });

  test("ignores a role carried by another collection", () => {
    expect(isSuperAdmin(reqFor(impostor))).toBe(false);
  });
});

describe("isStaff", () => {
  test("passes every admin role except partner", () => {
    for (const role of ["super-admin", "content-manager", "editor", "viewer"]) {
      expect(isStaff(reqFor(admin(role)))).toBe(true);
    }
    expect(isStaff(reqFor(partner))).toBe(false);
    expect(isStaff(reqFor(null))).toBe(false);
    expect(isStaff(reqFor(impostor))).toBe(false);
  });
});

describe("readOwnPartnerOrStaff", () => {
  const read = readOwnPartnerOrStaff("store");

  test("staff read everything", () => {
    expect(read(reqFor(editor))).toBe(true);
    expect(read(reqFor(superAdmin))).toBe(true);
  });

  test("a partner is limited to rows pointing at their own partner", () => {
    expect(read(reqFor(partner))).toEqual({ store: { equals: "partner-a" } });
  });

  test("a populated partner relationship is reduced to its id", () => {
    const populated = admin("partner", { partner: { id: "partner-b" } });
    expect(read(reqFor(populated))).toEqual({ store: { equals: "partner-b" } });
  });

  test("a partner with no partner assigned matches nothing", () => {
    expect(read(reqFor(admin("partner", { partner: null })))).toBe(false);
    expect(read(reqFor(admin("partner")))).toBe(false);
  });

  test("anonymous and non-admin callers read nothing", () => {
    expect(read(reqFor(null))).toBe(false);
    expect(read(reqFor(impostor))).toBe(false);
  });
});

describe("admins collection", () => {
  const { access, fields } = Admins;

  const fieldAccess = (name: string) => {
    const field = fields.find((f) => "name" in f && f.name === name);
    return field && "access" in field ? field.access : undefined;
  };

  test("only a super-admin creates or deletes accounts", async () => {
    expect(await access?.create?.(reqFor(null))).toBe(false);
    expect(await access?.create?.(reqFor(editor))).toBe(false);
    expect(await access?.create?.(reqFor(partner))).toBe(false);
    expect(await access?.create?.(reqFor(superAdmin))).toBe(true);
    expect(await access?.delete?.(reqFor(editor))).toBe(false);
    expect(await access?.delete?.(reqFor(superAdmin))).toBe(true);
  });

  test("a non-super admin can update only their own record", async () => {
    expect(await access?.update?.(reqFor(null))).toBe(false);
    expect(await access?.update?.(reqFor(editor))).toEqual({
      id: { equals: editor.id },
    });
    expect(await access?.update?.(reqFor(superAdmin))).toBe(true);
  });

  test("a partner reads only their own admin record", async () => {
    expect(await access?.read?.(reqFor(null))).toBe(false);
    expect(await access?.read?.(reqFor(partner))).toEqual({
      id: { equals: partner.id },
    });
    expect(await access?.read?.(reqFor(editor))).toBe(true);
  });

  test("role and partner can be set only by a super-admin", async () => {
    for (const name of ["role", "partner"]) {
      const rules = fieldAccess(name);
      expect(await rules?.update?.(reqFor(editor))).toBe(false);
      expect(await rules?.update?.(reqFor(partner))).toBe(false);
      expect(await rules?.update?.(reqFor(superAdmin))).toBe(true);
      expect(await rules?.create?.(reqFor(editor))).toBe(false);
    }
  });
});

describe("analytics collections", () => {
  test("news-analytics cannot be written over REST or read by a partner", async () => {
    const { access } = NewsAnalytics;
    expect(await access?.create?.(reqFor(null))).toBe(false);
    expect(await access?.create?.(reqFor(superAdmin))).toBe(false);
    expect(await access?.read?.(reqFor(null))).toBe(false);
    expect(await access?.read?.(reqFor(partner))).toBe(false);
    expect(await access?.read?.(reqFor(editor))).toBe(true);
  });

  test("shop-analytics cannot be written over REST and is scoped for partners", async () => {
    const { access } = ShopAnalytics;
    expect(await access?.create?.(reqFor(null))).toBe(false);
    expect(await access?.read?.(reqFor(null))).toBe(false);
    expect(await access?.read?.(reqFor(partner))).toEqual({
      store: { equals: "partner-a" },
    });
    expect(await access?.read?.(reqFor(editor))).toBe(true);
  });

  test("partner-conversions is neither public nor writable by a partner", async () => {
    const { access } = PartnerConversions;
    expect(await access?.read?.(reqFor(null))).toBe(false);
    expect(await access?.read?.(reqFor(partner))).toEqual({
      partner: { equals: "partner-a" },
    });
    expect(await access?.read?.(reqFor(editor))).toBe(true);
    for (const op of ["create", "update", "delete"] as const) {
      expect(await access?.[op]?.(reqFor(null))).toBe(false);
      expect(await access?.[op]?.(reqFor(partner))).toBe(false);
      expect(await access?.[op]?.(reqFor(editor))).toBe(true);
    }
  });
});

describe("iWitness data", () => {
  test("witness-reports are not public and cannot be filed over REST", async () => {
    const { access } = WitnessReport;
    expect(await access?.read?.(reqFor(null))).toBe(false);
    expect(await access?.read?.(reqFor(partner))).toBe(false);
    expect(await access?.read?.(reqFor(editor))).toBe(true);
    expect(await access?.create?.(reqFor(null))).toBe(false);
    expect(await access?.create?.(reqFor(superAdmin))).toBe(false);
  });

  describe("media listing", () => {
    const withPartner = (
      user: TestUser | null,
      findByID: () => Promise<{ logo?: unknown }>
    ) =>
      ({
        req: { user, payload: { findByID } },
      }) as unknown as Parameters<Access>[0];
    const read = Media.access?.read;

    test("is closed to the public and open to staff", async () => {
      const noLookup = async () => ({});
      expect(await read?.(withPartner(null, noLookup))).toBe(false);
      expect(await read?.(withPartner(impostor, noLookup))).toBe(false);
      expect(await read?.(withPartner(editor, noLookup))).toBe(true);
    });

    test("a partner sees only their own logo", async () => {
      expect(
        await read?.(withPartner(partner, async () => ({ logo: "logo-1" })))
      ).toEqual({ id: { equals: "logo-1" } });
      expect(
        await read?.(
          withPartner(partner, async () => ({ logo: { id: "logo-2" } }))
        )
      ).toEqual({ id: { equals: "logo-2" } });
    });

    test("a partner with no logo, no partner, or an unloadable record sees nothing", async () => {
      expect(
        await read?.(withPartner(partner, async () => ({ logo: null })))
      ).toBe(false);
      expect(
        await read?.(
          withPartner(admin("partner"), async () => ({ logo: "logo-1" }))
        )
      ).toBe(false);
      expect(
        await read?.(
          withPartner(partner, () => Promise.reject(new Error("not found")))
        )
      ).toBe(false);
    });
  });
});

describe("Admins deletion", () => {
  /**
   * The FK from news.author to admins is ON DELETE SET NULL, so a permanent
   * delete silently orphans articles (and crashes nothing, which is worse).
   * Trash keeps the row; the guard only has to hold on permanent delete.
   */
  const beforeDelete = Admins.hooks?.beforeDelete?.[0] as unknown as (args: {
    id: string;
    req: {
      payload: { count: (args: unknown) => Promise<{ totalDocs: number }> };
    };
  }) => Promise<void>;

  const withCount = (totalDocs: number) => ({
    id: "admin-1",
    req: { payload: { count: async () => ({ totalDocs }) } },
  });

  test("deletes go to trash by default", () => {
    expect(Admins.trash).toBe(true);
  });

  test("permanent delete is refused while the admin authored articles", async () => {
    await expect(beforeDelete(withCount(12))).rejects.toThrow("12 article(s)");
  });

  test("permanent delete is allowed once the articles are reassigned", async () => {
    await expect(beforeDelete(withCount(0))).resolves.toBeUndefined();
  });
});
