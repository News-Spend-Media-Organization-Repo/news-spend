import { describe, expect, mock, test } from "bun:test";
import type { CollectionBeforeDeleteHook } from "payload";

import { preventDeleteWithQuestions } from "../src/collections/FaqCategories";
import { FAQ_ICONS, FAQ_SEED } from "../src/lib/faqSeed";

const deleteArgs = (count: ReturnType<typeof mock>) =>
  ({
    id: "c1",
    req: { payload: { count } },
  }) as unknown as Parameters<CollectionBeforeDeleteHook>[0];

const countCall = (count: ReturnType<typeof mock>) => count.mock.calls[0]?.[0];

describe("FAQ_SEED", () => {
  test("has 8 categories and 22 questions, every icon in FAQ_ICONS", () => {
    expect(FAQ_SEED).toHaveLength(8);
    expect(FAQ_SEED.flatMap((category) => category.questions)).toHaveLength(22);
    for (const category of FAQ_SEED) {
      expect(FAQ_ICONS).toContain(category.icon);
    }
  });

  test("category order is the owner's", () => {
    expect(FAQ_SEED.map((category) => category.name)).toEqual([
      "Getting Started",
      "Dream Points & Rewards",
      "Giveaways & Prize Tiers",
      "Dream Fulfillment",
      "Advertising & Partnerships",
      "Account & Security",
      "Technical Support",
      "Support & Policies",
    ]);
  });

  test("Giveaways & Prize Tiers holds 11 questions, first about participating", () => {
    const giveaways = FAQ_SEED.find(
      (category) => category.name === "Giveaways & Prize Tiers"
    );
    expect(giveaways?.questions).toHaveLength(11);
    expect(giveaways?.questions[0]?.question).toBe(
      "What is the NewsSpend Giveaway, and how do I participate?"
    );
  });
});

describe("preventDeleteWithQuestions", () => {
  test("throws when the category still has questions", async () => {
    const count = mock(async () => ({ totalDocs: 3 }));

    const args = deleteArgs(count);

    await expect(preventDeleteWithQuestions(args)).rejects.toThrow(
      "Move or delete its 3 questions first."
    );
    expect(count).toHaveBeenCalledWith({
      collection: "faqs",
      where: { category: { equals: "c1" } },
      req: args.req,
    });
  });

  test("counts inside the hook's own request, so a transaction sees its writes", async () => {
    const count = mock(async () => ({ totalDocs: 0 }));
    const args = deleteArgs(count);

    await preventDeleteWithQuestions(args);

    expect(countCall(count)).toHaveProperty("req", args.req);
  });

  test("uses the singular for exactly one question", async () => {
    const count = mock(async () => ({ totalDocs: 1 }));

    await expect(preventDeleteWithQuestions(deleteArgs(count))).rejects.toThrow(
      "Move or delete its 1 question first."
    );
  });

  test("resolves when the category has no questions", async () => {
    const count = mock(async () => ({ totalDocs: 0 }));

    await expect(
      preventDeleteWithQuestions(deleteArgs(count))
    ).resolves.toBeUndefined();
  });
});
