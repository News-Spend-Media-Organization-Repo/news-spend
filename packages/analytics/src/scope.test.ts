import { describe, expect, it } from "bun:test";

import {
  AnalyticsAccessError,
  partnerFilter,
  requireStaff,
  scopeFor,
} from "./scope";

describe("scopeFor", () => {
  it("gives staff scope to an admin who is not a partner", () => {
    for (const role of ["super-admin", "content-manager", "editor", "viewer"]) {
      expect(scopeFor({ collection: "admins", role })?.kind).toBe("staff");
    }
  });

  it("gives a partner admin their own partner", () => {
    const scope = scopeFor({
      collection: "admins",
      role: "partner",
      partner: "p-1",
    });
    expect(scope).toMatchObject({ kind: "partner", partnerId: "p-1" });
  });

  it("reads the partner from an populated relation too", () => {
    const scope = scopeFor({
      collection: "admins",
      role: "partner",
      partner: { id: "p-2" },
    });
    expect(scope).toMatchObject({ kind: "partner", partnerId: "p-2" });
  });

  it("gives a partner admin with no partner assigned no scope, not staff", () => {
    for (const partner of [undefined, null, "", { id: "" }]) {
      expect(
        scopeFor({
          collection: "admins",
          role: "partner",
          partner: partner as never,
        })
      ).toBeNull();
    }
  });

  it("gives nothing to anyone who is not an admin", () => {
    expect(scopeFor(null)).toBeNull();
    expect(scopeFor(undefined)).toBeNull();
    // An app user, even one carrying a staff-looking role.
    expect(scopeFor({ collection: "users", role: "super-admin" })).toBeNull();
    expect(scopeFor({ role: "super-admin" })).toBeNull();
  });
});

describe("requireStaff", () => {
  it("lets staff through and stops a partner", () => {
    const staff = scopeFor({ collection: "admins", role: "editor" });
    const partner = scopeFor({
      collection: "admins",
      role: "partner",
      partner: "p-1",
    });
    if (!(staff && partner)) {
      throw new Error("fixture scopes should exist");
    }

    expect(() => requireStaff(staff)).not.toThrow();
    expect(() => requireStaff(partner)).toThrow(AnalyticsAccessError);
  });
});

describe("partnerFilter", () => {
  const staff = scopeFor({ collection: "admins", role: "editor" });
  const partner = scopeFor({
    collection: "admins",
    role: "partner",
    partner: "p-1",
  });
  if (!(staff && partner)) {
    throw new Error("fixture scopes should exist");
  }

  it("limits a partner to their own whether or not they ask", () => {
    expect(partnerFilter(partner)).toBe("p-1");
    expect(partnerFilter(partner, "p-1")).toBe("p-1");
  });

  it("refuses a partner who names someone else", () => {
    expect(() => partnerFilter(partner, "p-2")).toThrow(AnalyticsAccessError);
  });

  it("lets staff see one partner or all of them", () => {
    expect(partnerFilter(staff, "p-2")).toBe("p-2");
    expect(partnerFilter(staff)).toBeUndefined();
  });
});
