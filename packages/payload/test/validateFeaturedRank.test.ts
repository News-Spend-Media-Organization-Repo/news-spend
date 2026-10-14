import { describe, expect, it } from "bun:test";

import { validateFeaturedRank } from "../src/lib/validateFeaturedRank";

const now = new Date("2026-10-14T10:00:00.000Z");
const hour = 3_600_000;
const at = (offsetHours: number) =>
  new Date(now.getTime() + offsetHours * hour).toISOString();

type Story = {
  id: string;
  title: string;
  featured: boolean;
  featuredRank: number;
  featuredUntil?: string | null;
  _status?: "published" | "draft";
};

/**
 * A `find` that applies the same filters the rule asks for, over a handful of
 * stories, so the test fails if the rule's `where` stops excluding something.
 */
const payloadWith = (stories: Story[]) => ({
  find: async ({ where }: { where: { and: Record<string, any>[] } }) => {
    const clauses = where.and;
    const docs = stories.filter((story) =>
      clauses.every((clause) => {
        if (clause.featured) {
          return story.featured === clause.featured.equals;
        }
        if (clause.featuredRank) {
          return story.featuredRank === clause.featuredRank.equals;
        }
        if (clause._status) {
          return (story._status ?? "published") === clause._status.equals;
        }
        if (clause.id) {
          return story.id !== clause.id.not_equals;
        }
        if (clause.or) {
          return clause.or.some((option: Record<string, any>) => {
            const until = option.featuredUntil;
            if (until.exists === false) {
              return !story.featuredUntil;
            }
            return (
              !!story.featuredUntil && story.featuredUntil > until.greater_than
            );
          });
        }
        return true;
      })
    );
    return { docs: docs.slice(0, 1) } as never;
  },
});

const story = (overrides: Partial<Story>): Story => ({
  id: "other",
  title: "Other story",
  featured: true,
  featuredRank: 1,
  ...overrides,
});

const run = (
  stories: Story[],
  args: { value?: number | null; featured?: boolean; id?: string }
) =>
  validateFeaturedRank({
    value: args.value === undefined ? 1 : args.value,
    featured: args.featured ?? true,
    id: args.id ?? "me",
    payload: payloadWith(stories),
    now,
  });

describe("validateFeaturedRank", () => {
  it("rejects a rank another live story already holds, naming it", async () => {
    const result = await run([story({ title: "Old lead" })], {});

    expect(result).toContain("Rank 1 is already used by");
    expect(result).toContain("Old lead");
  });

  it("allows a rank nobody holds", async () => {
    expect(await run([story({ featuredRank: 2 })], { value: 1 })).toBe(true);
  });

  it("allows a story to keep its own rank", async () => {
    expect(
      await run([story({ id: "me", featuredRank: 1 })], { id: "me" })
    ).toBe(true);
  });

  it("does not count a story whose end time has passed", async () => {
    expect(await run([story({ featuredUntil: at(-1) })], {})).toBe(true);
  });

  it("does count a story whose end time is still ahead", async () => {
    expect(await run([story({ featuredUntil: at(5) })], {})).not.toBe(true);
  });

  it("does not count an unpublished draft or an unfeatured story", async () => {
    expect(await run([story({ _status: "draft" })], {})).toBe(true);
    expect(await run([story({ featured: false })], {})).toBe(true);
  });

  it("skips the check when the story is not featured or has no rank", async () => {
    const clash = [story({})];

    expect(await run(clash, { featured: false })).toBe(true);
    expect(await run(clash, { value: null })).toBe(true);
  });
});
