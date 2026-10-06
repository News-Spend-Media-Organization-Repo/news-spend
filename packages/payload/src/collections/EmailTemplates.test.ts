import { describe, expect, test } from "vitest";

import { EmailTemplates } from "./EmailTemplates";

const endpoint = (path: string) => {
  const found = (EmailTemplates.endpoints || []).find(
    (e: { path: string }) => e.path === path
  );
  if (!found) {
    throw new Error(`missing endpoint ${path}`);
  }
  return found.handler;
};

const reqFor = (user: unknown) =>
  ({
    user,
    routeParams: { id: "1" },
    json: async () => ({ to: "x@example.com" }),
    payload: {
      findByID: async () => {
        throw new Error("must not be reached");
      },
    },
  }) as never;

const partner = { collection: "admins", role: "partner" };

describe("email-templates endpoint access", () => {
  for (const path of ["/:id/preview", "/:id/test-send"]) {
    test(`${path} rejects anonymous`, async () => {
      const res = await endpoint(path)(reqFor(null));
      expect(res.status).toBe(403);
    });

    test(`${path} rejects partners`, async () => {
      const res = await endpoint(path)(reqFor(partner));
      expect(res.status).toBe(403);
    });
  }

  test("read access excludes partners, includes staff", () => {
    const read = EmailTemplates.access?.read as (a: never) => boolean;
    expect(read({ req: { user: partner } } as never)).toBe(false);
    expect(
      read({
        req: { user: { collection: "admins", role: "super-admin" } },
      } as never)
    ).toBe(true);
  });
});
