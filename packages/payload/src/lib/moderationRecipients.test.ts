import { describe, expect, it } from "vitest";

import {
  type AdminRecord,
  parseExtraEmails,
  selectRecipients,
} from "./moderationRecipients";

const admin = (over: Partial<AdminRecord> = {}): AdminRecord => ({
  email: "a@example.com",
  role: "viewer",
  ...over,
});

describe("selectRecipients", () => {
  describe("role defaults (no explicit preference)", () => {
    it("includes super-admins and content-managers", () => {
      const admins = [
        admin({ email: "super@x.com", role: "super-admin" }),
        admin({ email: "cm@x.com", role: "content-manager" }),
      ];

      expect(selectRecipients(admins, "urgent")).toEqual([
        "super@x.com",
        "cm@x.com",
      ]);
      expect(selectRecipients(admins, "digest")).toHaveLength(2);
    });

    it("excludes editors and viewers", () => {
      const admins = [
        admin({ email: "ed@x.com", role: "editor" }),
        admin({ email: "vw@x.com", role: "viewer" }),
      ];

      expect(selectRecipients(admins, "urgent")).toEqual([]);
      expect(selectRecipients(admins, "digest")).toEqual([]);
    });
  });

  describe("explicit preferences", () => {
    it("honours an opt-in from a role that gets nothing by default", () => {
      const admins = [
        admin({ email: "ed@x.com", role: "editor", moderationAlerts: "all" }),
      ];

      expect(selectRecipients(admins, "urgent")).toEqual(["ed@x.com"]);
      expect(selectRecipients(admins, "digest")).toEqual(["ed@x.com"]);
    });

    it("honours an opt-out from a role that gets everything by default", () => {
      const admins = [
        admin({
          email: "super@x.com",
          role: "super-admin",
          moderationAlerts: "none",
        }),
      ];

      expect(selectRecipients(admins, "urgent")).toEqual([]);
      expect(selectRecipients(admins, "digest")).toEqual([]);
    });

    it("routes urgent-only and digest-only to the right tier", () => {
      const admins = [
        admin({ email: "u@x.com", role: "viewer", moderationAlerts: "urgent" }),
        admin({ email: "d@x.com", role: "viewer", moderationAlerts: "digest" }),
      ];

      expect(selectRecipients(admins, "urgent")).toEqual(["u@x.com"]);
      expect(selectRecipients(admins, "digest")).toEqual(["d@x.com"]);
    });
  });

  describe("partners", () => {
    it("never receives moderation email, even when opted in", () => {
      // Reports quote user content and identify reporters; partners are
      // external parties, so an explicit opt-in must not override this.
      const admins = [
        admin({ email: "p@x.com", role: "partner", moderationAlerts: "all" }),
      ];

      expect(selectRecipients(admins, "urgent")).toEqual([]);
      expect(selectRecipients(admins, "digest")).toEqual([]);
    });
  });

  describe("hygiene", () => {
    it("skips admins with no email", () => {
      const admins = [admin({ email: null, role: "super-admin" })];
      expect(selectRecipients(admins, "digest")).toEqual([]);
    });

    it("appends extra addresses from config", () => {
      const admins = [admin({ email: "super@x.com", role: "super-admin" })];

      expect(selectRecipients(admins, "urgent", ["oncall@x.com"])).toEqual([
        "super@x.com",
        "oncall@x.com",
      ]);
    });

    it("dedupes case-insensitively", () => {
      const admins = [
        admin({ email: "Super@X.com", role: "super-admin" }),
        admin({ email: "super@x.com", role: "content-manager" }),
      ];

      expect(selectRecipients(admins, "digest", ["SUPER@X.COM"])).toEqual([
        "Super@X.com",
      ]);
    });

    it("returns an empty list when nobody is configured", () => {
      expect(selectRecipients([], "urgent")).toEqual([]);
    });
  });
});

describe("parseExtraEmails", () => {
  it("splits, trims and drops blanks", () => {
    expect(parseExtraEmails(" a@x.com , b@x.com ,, ")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("returns nothing when unset", () => {
    expect(parseExtraEmails(undefined)).toEqual([]);
    expect(parseExtraEmails("")).toEqual([]);
  });
});
