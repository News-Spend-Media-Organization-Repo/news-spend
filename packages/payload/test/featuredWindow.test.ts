import { describe, expect, it } from "bun:test";

import {
  DEFAULT_FEATURED_HOURS,
  resolveFeaturedUntil,
} from "../src/hooks/news/applyFeaturedWindow";

const now = new Date("2026-10-14T10:00:00.000Z");
const inHours = (hours: number) =>
  new Date(now.getTime() + hours * 3_600_000).toISOString();

describe("resolveFeaturedUntil", () => {
  it("stamps the default window when a story is newly featured", () => {
    expect(
      resolveFeaturedUntil({
        data: { featured: true },
        originalDoc: { featured: false },
        now,
      })
    ).toBe(inHours(DEFAULT_FEATURED_HOURS));
  });

  it("stamps it on create", () => {
    expect(
      resolveFeaturedUntil({ data: { featured: true }, originalDoc: null, now })
    ).toBe(inHours(DEFAULT_FEATURED_HOURS));
  });

  it("keeps an end time the admin chose", () => {
    expect(
      resolveFeaturedUntil({
        data: { featured: true, featuredUntil: "2026-10-20T00:00:00.000Z" },
        originalDoc: { featured: false },
        now,
      })
    ).toBeUndefined();
  });

  it("leaves a story that was already featured alone", () => {
    expect(
      resolveFeaturedUntil({
        data: { featured: true },
        originalDoc: { featured: true, featuredUntil: null },
        now,
      })
    ).toBeUndefined();
  });

  it("does nothing for an edit that does not touch featured", () => {
    expect(
      resolveFeaturedUntil({ data: {}, originalDoc: { featured: true }, now })
    ).toBeUndefined();
  });

  it("clears the end time when a story is unfeatured", () => {
    expect(
      resolveFeaturedUntil({
        data: { featured: false },
        originalDoc: { featured: true, featuredUntil: inHours(5) },
        now,
      })
    ).toBeNull();
  });
});
