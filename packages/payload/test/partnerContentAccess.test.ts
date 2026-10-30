import { describe, expect, test } from "bun:test";
import type { Access, CollectionConfig, Field } from "payload";
import { readStaffOrOwnPartnerMedia } from "../src/access/adminRoles";
import { PartnerContent } from "../src/collections/PartnerContent";
import { guardCollection, PARTNER_ACCESS } from "../src/plugins/partner-guard";

const PARTNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const partner = { collection: "admins", role: "partner", partner: PARTNER };
const unassigned = { collection: "admins", role: "partner" };
const editor = { collection: "admins", role: "editor" };
const appUser = { collection: "users", role: "viewer" };

const run = (access: Access | undefined, user: unknown) =>
  access?.({ req: { user } } as never);

describe("partner content, for a partner signed in to the panel", () => {
  const guarded = guardCollection(
    PartnerContent,
    PARTNER_ACCESS["partner-content"]
  );

  test("is open to partners for reading only", () => {
    expect(PARTNER_ACCESS["partner-content"]).toEqual(["read"]);
    for (const op of ["create", "update", "delete"] as const) {
      expect(run(guarded.access?.[op], partner)).toBe(false);
      expect(run(guarded.access?.[op], editor)).toBe(true);
    }
  });

  test("a partner reads only their own rows", () => {
    expect(run(guarded.access?.read, partner)).toEqual({
      partner: { equals: PARTNER },
    });
  });

  test("a partner with no company reads nothing", () => {
    expect(run(guarded.access?.read, unassigned)).toBe(false);
  });

  test("staff read everything; no one else reads anything", async () => {
    expect(await run(guarded.access?.read, editor)).toBe(true);
    expect(await run(guarded.access?.read, appUser)).toBe(false);
    expect(await run(guarded.access?.read, null)).toBe(false);
  });

  test("internal delivery settings are not readable by a partner", () => {
    const flat = (fields: Field[]): Field[] =>
      fields.flatMap((f) => {
        if (f.type === "tabs") {
          return f.tabs.flatMap((t) => flat(t.fields));
        }
        return "fields" in f ? [f, ...flat(f.fields)] : [f];
      });
    const field = (c: CollectionConfig, name: string) =>
      flat(c.fields).find((f) => "name" in f && f.name === name);

    for (const name of ["notes", "displayNotes", "weight"]) {
      const read = (
        field(PartnerContent, name) as { access?: { read?: Access } }
      ).access?.read;
      expect(run(read, partner)).toBe(false);
      expect(run(read, editor)).toBe(true);
    }
    // What the partner is there to see.
    for (const name of ["title", "status", "media", "points"]) {
      expect(
        (field(PartnerContent, name) as { access?: unknown }).access
      ).toBeUndefined();
    }
  });
});

describe("media a partner may preview", () => {
  const reqFor = (user: unknown, logo: unknown, content: unknown[]) =>
    ({
      user,
      payload: {
        findByID: async () => ({ logo }),
        find: async () => ({ docs: content }),
      },
    }) as never;

  test("is their logo plus the files their own content uses", async () => {
    const result = (await readStaffOrOwnPartnerMedia({
      req: reqFor(partner, "logo-1", [
        { id: "c1", media: "img-1", video: "vid-1" },
        {
          id: "c2",
          media: null,
          items: [
            {
              layout: [
                { blockType: "promo-image", image: "img-2" },
                {
                  blockType: "promo-video-source",
                  video: "vid-2",
                  thumbnail: "thumb-1",
                },
              ],
            },
          ],
        },
      ]),
    })) as { id: { in: string[] } };

    expect(result.id.in.sort()).toEqual(
      ["img-1", "img-2", "logo-1", "thumb-1", "vid-1", "vid-2"].sort()
    );
  });

  test("is nothing when they have no logo and no content", async () => {
    expect(
      await readStaffOrOwnPartnerMedia({ req: reqFor(partner, null, []) })
    ).toBe(false);
  });

  test("does not mistake a content id for a file", async () => {
    const result = (await readStaffOrOwnPartnerMedia({
      req: reqFor(partner, null, [{ id: "c1", media: "img-1" }]),
    })) as { id: { in: string[] } };

    expect(result.id.in).toEqual(["img-1"]);
  });

  test("staff see all, an unassigned partner and an app user none", async () => {
    expect(
      await readStaffOrOwnPartnerMedia({ req: reqFor(editor, null, []) })
    ).toBe(true);
    expect(
      await readStaffOrOwnPartnerMedia({ req: reqFor(unassigned, null, []) })
    ).toBe(false);
    expect(
      await readStaffOrOwnPartnerMedia({ req: reqFor(appUser, null, []) })
    ).toBe(false);
  });

  test("grants nothing when the partner cannot be loaded", async () => {
    const req = {
      user: partner,
      payload: {
        findByID: () => Promise.reject(new Error("gone")),
        find: async () => ({ docs: [] }),
      },
    } as never;

    expect(await readStaffOrOwnPartnerMedia({ req })).toBe(false);
  });
});
