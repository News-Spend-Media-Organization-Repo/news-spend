import { describe, expect, test } from "bun:test";
import type { Payload, PayloadRequest } from "payload";

import { FAQ_SEED } from "../src/lib/faqSeed";
import { seedFaqIfEmpty } from "../src/lib/seedFaq";
import { down, up } from "../src/migrations/20261017_161125_faq_seed";

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

describe("faq_seed migration down", () => {
  type DeleteArgs = {
    collection: string;
    where: Record<string, { equals: string }>;
    req?: PayloadRequest;
  };

  const run = async () => {
    const deletes: DeleteArgs[] = [];
    const payload = {
      delete: async (args: DeleteArgs) => {
        deletes.push(args);
        return { docs: [], errors: [] };
      },
    };
    const req = { transactionID: "tx" } as unknown as PayloadRequest;
    await down({ payload, req } as unknown as Parameters<typeof down>[0]);
    return { deletes, req };
  };

  test("deletes every seeded question before any category", async () => {
    const { deletes } = await run();

    expect(deletes).toHaveLength(30);
    expect(deletes.slice(0, 22).every((d) => d.collection === "faqs")).toBe(
      true
    );
    expect(
      deletes.slice(22).every((d) => d.collection === "faq-categories")
    ).toBe(true);
  });

  test("matches only the exact seed question and name text", async () => {
    const { deletes } = await run();

    expect(
      deletes
        .filter((d) => d.collection === "faqs")
        .map((d) => d.where.question)
    ).toEqual(
      FAQ_SEED.flatMap((c) => c.questions).map((q) => ({
        equals: q.question,
      }))
    );
    expect(
      deletes
        .filter((d) => d.collection === "faq-categories")
        .map((d) => d.where.name)
    ).toEqual(FAQ_SEED.map((c) => ({ equals: c.name })));
  });

  test("passes req to every delete", async () => {
    const { deletes, req } = await run();

    expect(deletes.every((d) => d.req === req)).toBe(true);
  });
});

describe("faq_seed migration up", () => {
  test("takes the advisory lock before it counts or creates anything", async () => {
    const events: string[] = [];
    const executed: unknown[] = [];
    const db = {
      execute: async (query: unknown) => {
        events.push("lock");
        executed.push(query);
      },
    };
    const payload = {
      count: async ({ collection }: { collection: string }) => {
        events.push(`count:${collection}`);
        return { totalDocs: 1 };
      },
      create: async () => {
        events.push("create");
        return { id: "x" };
      },
    };

    await up({ db, payload } as unknown as Parameters<typeof up>[0]);

    expect(events[0]).toBe("lock");
    expect(events.filter((e) => e === "lock")).toHaveLength(1);
    expect(events.slice(1)).toEqual(["count:faq-categories", "count:faqs"]);
    expect(JSON.stringify(executed[0])).toContain("pg_advisory_xact_lock");
  });
});
