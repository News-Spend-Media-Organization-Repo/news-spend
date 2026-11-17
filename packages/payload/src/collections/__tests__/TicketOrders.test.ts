import { describe, expect, test } from "bun:test";

import { TicketOrders } from "../TicketOrders";

const user = { collection: "users", id: "user-1" };
const anotherUser = { collection: "users", id: "user-2" };
const staff = { collection: "admins", id: "admin-1", role: "super-admin" };
const partner = { collection: "admins", id: "admin-2", role: "partner" };

const accessFor = (
  op: "read" | "create" | "update" | "delete",
  who: unknown
) => {
  const rule = TicketOrders.access?.[op];
  if (rule === undefined) {
    throw new Error(`missing ${op} access rule`);
  }
  return rule({ req: { user: who } } as never);
};

describe("ticket-orders access", () => {
  test("a user reads only their own orders", () => {
    expect(accessFor("read", user)).toEqual({ user: { equals: "user-1" } });
    expect(accessFor("read", anotherUser)).toEqual({
      user: { equals: "user-2" },
    });
  });

  test("staff read every order", () => {
    expect(accessFor("read", staff)).toBe(true);
  });

  test("anonymous and partner admins read nothing", () => {
    expect(accessFor("read", null)).toBe(false);
    expect(accessFor("read", partner)).toBe(false);
  });

  test("only staff may create, update or delete", () => {
    for (const op of ["create", "update", "delete"] as const) {
      expect(accessFor(op, staff)).toBe(true);
      expect(accessFor(op, user)).toBe(false);
      expect(accessFor(op, null)).toBe(false);
    }
  });

  test("keys are unique and indexed", () => {
    const field = (name: string) =>
      TicketOrders.fields.find(
        (candidate) => "name" in candidate && candidate.name === name
      );
    for (const name of [
      "clientRef",
      "idempotencyKey",
      "reference",
      "orderReference",
    ]) {
      expect(field(name)).toMatchObject({ unique: true, index: true });
    }
  });
});
