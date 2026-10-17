import { describe, expect, test } from "bun:test";
import type { Payload, PayloadRequest } from "payload";

import { FAQ_SEED } from "../src/lib/faqSeed";
import { seedFaqIfEmpty } from "../src/lib/seedFaq";

type CreateArgs = {
  collection: string;
  data: Record<string, unknown>;
  req?: PayloadRequest;
};

const makeFake = (totals: { categories?: number; faqs?: number } = {}) => {
  const creates: CreateArgs[] = [];
  const counts: string[] = [];
  const payload = {
    count: async ({ collection }: { collection: string }) => {
      counts.push(collection);
      return {
        totalDocs:
          collection === "faq-categories"
            ? (totals.categories ?? 0)
            : (totals.faqs ?? 0),
      };
    },
    create: async (args: CreateArgs) => {
      creates.push(args);
      return { id: `${args.collection}-${creates.length}` };
    },
  } as unknown as Pick<Payload, "count" | "create">;
  return { payload, creates, counts };
};

describe("seedFaqIfEmpty", () => {
  test("seeds 8 categories then 22 questions when both collections are empty", async () => {
    const { payload, creates } = makeFake();

    const result = await seedFaqIfEmpty(payload);

    expect(result).toBe("seeded");
    const categories = creates.filter((c) => c.collection === "faq-categories");
    const questions = creates.filter((c) => c.collection === "faqs");
    expect(categories).toHaveLength(8);
    expect(questions).toHaveLength(22);

    expect(categories.map((c) => c.data.name)).toEqual(
      FAQ_SEED.map((c) => c.name)
    );
    expect(categories.map((c) => c.data.icon)).toEqual(
      FAQ_SEED.map((c) => c.icon)
    );

    const expected = FAQ_SEED.flatMap((category, index) =>
      category.questions.map((q) => ({
        question: q.question,
        answer: q.answer,
        category: `faq-categories-${creates.indexOf(categories[index] as CreateArgs) + 1}`,
        _status: "published",
      }))
    );
    expect(questions.map((c) => c.data)).toEqual(expected);
  });

  test("creates every category before any question", async () => {
    const { payload, creates } = makeFake();

    await seedFaqIfEmpty(payload);

    expect(
      creates.slice(0, 8).every((c) => c.collection === "faq-categories")
    ).toBe(true);
    expect(creates.slice(8).every((c) => c.collection === "faqs")).toBe(true);
  });

  test("passes req through to every create", async () => {
    const { payload, creates } = makeFake();
    const req = { transactionID: "tx" } as unknown as PayloadRequest;

    await seedFaqIfEmpty(payload, req);

    expect(creates).toHaveLength(30);
    expect(creates.every((c) => c.req === req)).toBe(true);
  });

  test("skips when faq-categories has any document", async () => {
    const { payload, creates } = makeFake({ categories: 1 });

    expect(await seedFaqIfEmpty(payload)).toBe("skipped");
    expect(creates).toHaveLength(0);
  });

  test("skips when faqs has any document, drafts included", async () => {
    const { payload, creates, counts } = makeFake({ faqs: 3 });

    expect(await seedFaqIfEmpty(payload)).toBe("skipped");
    expect(counts).toContain("faqs");
    expect(creates).toHaveLength(0);
  });
});
