import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { entries, latestEntry } from "../src/components/WhatsNew/entries";
import type { Entry } from "../src/components/WhatsNew/types";
import { DefaultTemplateStub, templateCalls } from "./analyticsTemplateStub";

mock.module("@payloadcms/next/templates", () => ({
  DefaultTemplate: DefaultTemplateStub,
}));
const whatsNew = await import("../src/components/WhatsNew");

const html = (node: unknown) => renderToStaticMarkup(node as never);
const NO_ACCESS = "No access";
const DATE = /^\d{4}-\d\d-\d\d$/;

const staff = { collection: "admins", id: "admin-1", role: "editor" };
const partner = { collection: "admins", id: "admin-2", role: "partner" };
const appUser = { collection: "users", id: "user-1", role: "super-admin" };

const pageProps = (user: unknown) => {
  const req = {
    user,
    payload: {
      config: {},
      importMap: { importMap: {} },
    },
  };
  return {
    initPageResult: {
      req,
      locale: "en",
      permissions: {},
      visibleEntities: { collections: {}, globals: {} },
    },
    params: { segments: ["whats-new"] },
    searchParams: {},
  } as never;
};

const fakeEntry = (id: string, date: string): Entry => ({
  id,
  date,
  title: `Entry ${id}`,
  sections: [{ heading: "New", items: ["Something happened."] }],
});

describe("Whats new entries", () => {
  test("are valid and newest first", () => {
    const ids = new Set<string>();
    for (const entry of entries) {
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(entry.date).toMatch(DATE);
      expect(
        new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10)
      ).toBe(entry.date);
      expect(entry.title.length).toBeLessThanOrEqual(80);
      expect(entry.sections.length).toBeGreaterThanOrEqual(1);
      expect(entry.sections.length).toBeLessThanOrEqual(4);
      for (const section of entry.sections) {
        expect(["New", "Changed", "Fixed", "What to do"]).toContain(
          section.heading
        );
        expect(section.items.length).toBeGreaterThanOrEqual(1);
        expect(section.items.length).toBeLessThanOrEqual(5);
        for (const item of section.items) {
          expect(item.length).toBeLessThanOrEqual(240);
          expect(item).not.toMatch(/<[^>]+>/);
        }
      }
      expect(entry.title).not.toMatch(/<[^>]+>/);
      if (entry.link) {
        expect(entry.link.href.startsWith("/admin/")).toBe(true);
        expect(entry.link.label).not.toMatch(/<[^>]+>/);
      }
    }

    const dates = entries.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  test("has the 2.7.0 entry and points at the Points page", () => {
    const entry = entries.find((item) => item.version === "2.7.0");

    expect(entry).toMatchObject({
      date: "2026-10-20",
      link: { href: "/admin/analytics/points" },
    });
    expect(latestEntry()?.date).toBe(entries[0]?.date);
  });
});

describe("Whats new page", () => {
  test("renders for staff inside the admin template", async () => {
    templateCalls.length = 0;
    const out = html(await whatsNew.WhatsNewPageView(pageProps(staff)));

    expect(out).toContain('data-template="default"');
    expect(out).toContain("v2.7.0");
    expect(out).toContain("What&#x27;s new");
    expect(templateCalls).toHaveLength(1);
  });

  test("gives a partner, an app user and a signed-out viewer No access with no entry text", async () => {
    for (const user of [partner, appUser, null]) {
      const out = html(await whatsNew.WhatsNewPageView(pageProps(user)));

      expect(out).toContain(NO_ACCESS);
      expect(out).not.toContain("Release 2.7.0");
      expect(out).toContain('data-template="default"');
    }
  });

  test("opens the newest five and collapses the rest and older years", () => {
    const fake = [
      ...Array.from({ length: 7 }, (_, i) =>
        fakeEntry(`current-${i}`, `2026-10-${String(20 - i).padStart(2, "0")}`)
      ),
      fakeEntry("old-1", "2025-12-01"),
      fakeEntry("old-2", "2025-11-01"),
    ];

    const out = html(whatsNew.WhatsNewBody({ entries: fake }));

    expect((out.match(/<details[^>]* open=""/g) ?? []).length).toBe(5);
    expect(out).toContain("2025");
    expect(out).toContain("Entry old-1");
  });

  test("works with no entries at all", () => {
    const out = html(whatsNew.WhatsNewBody({ entries: [] }));

    expect(out).toContain("Nothing new");
    expect(out).not.toContain("<details");
  });
});

describe("Whats new sidebar link", () => {
  test("shows only to staff", () => {
    expect(html(whatsNew.WhatsNewNavLink({ user: staff } as never))).toContain(
      'href="/admin/whats-new"'
    );
    expect(html(whatsNew.WhatsNewNavLink({ user: partner } as never))).toBe("");
    expect(html(whatsNew.WhatsNewNavLink({ user: appUser } as never))).toBe("");
    expect(html(whatsNew.WhatsNewNavLink({ user: null } as never))).toBe("");
  });
});

describe("Whats new marker", () => {
  test("knows when the newest entry is unread", () => {
    expect(whatsNew.isNewestUnread("2026-10-20", "2026-10-19")).toBe(true);
    expect(whatsNew.isNewestUnread("2026-10-20", "2026-10-20")).toBe(false);
    expect(whatsNew.isNewestUnread("2026-10-20", "2026-10-21")).toBe(false);
    expect(whatsNew.isNewestUnread("2026-10-20", null)).toBe(true);
    expect(whatsNew.isNewestUnread("2026-10-20", "not a date")).toBe(true);
  });
});

describe("Whats new registration", () => {
  test("the page and nav link are in the import map", () => {
    const importMap = readFileSync(
      path.resolve(
        import.meta.dir,
        "../../../apps/cms/src/app/(payload)/admin/importMap.js"
      ),
      "utf8"
    );

    expect(importMap).toContain(
      '"@news-spend-media/payload/components/WhatsNew#WhatsNewPageView"'
    );
    expect(importMap).toContain(
      '"@news-spend-media/payload/components/WhatsNew#WhatsNewNavLink"'
    );
  });
});
