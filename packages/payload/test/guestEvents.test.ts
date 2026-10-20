import { describe, expect, test } from "bun:test";
import type { Access, PayloadRequest } from "payload";

import GuestEvents from "../src/collections/GuestEvents";

type TestUser = { collection: string; id: string; role?: string };

const reqFor = (user: TestUser | null) =>
  ({ req: { user } }) as unknown as Parameters<Access>[0] & {
    req: PayloadRequest;
  };

const superAdmin: TestUser = {
  collection: "admins",
  id: "super-1",
  role: "super-admin",
};
const editor: TestUser = {
  collection: "admins",
  id: "editor-1",
  role: "editor",
};
const partner: TestUser = {
  collection: "admins",
  id: "partner-1",
  role: "partner",
};

const access = GuestEvents.access as Record<
  string,
  (args: Parameters<Access>[0]) => boolean
>;

describe("guest events collection", () => {
  test("staff read it; partners and the public do not", () => {
    expect(access.read?.(reqFor(superAdmin))).toBe(true);
    expect(access.read?.(reqFor(editor))).toBe(true);
    expect(access.read?.(reqFor(partner))).toBe(false);
    expect(access.read?.(reqFor(null))).toBe(false);
  });

  test("nobody writes through the API", () => {
    for (const args of [
      reqFor(superAdmin),
      reqFor(editor),
      reqFor(partner),
      reqFor(null),
    ]) {
      expect(access.create?.(args)).toBe(false);
      expect(access.update?.(args)).toBe(false);
      expect(access.delete?.(args)).toBe(false);
    }
  });

  test("stores both events with the required unique keys", () => {
    expect(GuestEvents.slug).toBe("guest-events");
    expect(GuestEvents.timestamps).toBe(false);
    expect(GuestEvents.indexes).toContainEqual({
      fields: ["kind", "anonymousUserId"],
      unique: true,
    });
    expect(GuestEvents.indexes).toContainEqual({
      fields: ["anonymousUserId", "userId"],
      unique: true,
    });
    expect(GuestEvents.fields.map((f) => ("name" in f ? f.name : ""))).toEqual([
      "kind",
      "anonymousUserId",
      "userId",
      "guestCreatedAt",
      "occurredAt",
      "createdAt",
    ]);
  });
});
