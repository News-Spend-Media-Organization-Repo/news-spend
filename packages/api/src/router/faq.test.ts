import { describe, expect, it } from "bun:test";
import {
  FAQ_CATEGORY_ORDER_FIELD,
  FAQ_QUESTION_ORDER_FIELD,
} from "@news-spend-media/payload/lib/faqFields";
import { call } from "@orpc/server";

import { createFakePayload, type Doc, mockContext } from "../test-utils";
import { faqRouter } from "./faq";

function category(id: string, order: string, overrides: Doc = {}): Doc {
  return {
    id,
    name: `Category ${id}`,
    icon: "rocket",
    [FAQ_CATEGORY_ORDER_FIELD]: order,
    ...overrides,
  };
}

function question(
  id: string,
  categoryId: string,
  order: string,
  overrides: Doc = {}
): Doc {
  return {
    id,
    question: `Question ${id}`,
    answer: `Answer ${id}`,
    category: categoryId,
    _status: "published",
    [FAQ_QUESTION_ORDER_FIELD]: order,
    ...overrides,
  };
}

function run(collections: { "faq-categories"?: Doc[]; faqs?: Doc[] }) {
  const payload = createFakePayload({ collections });
  const ctx = mockContext({ payload });
  return call(faqRouter.get, undefined, { context: ctx });
}

describe("faq.get", () => {
  it("returns categories in stored order with their published questions in stored order", async () => {
    const result = await run({
      "faq-categories": [category("c1", "b"), category("c2", "a")],
      faqs: [
        question("q1", "c1", "b"),
        question("q2", "c2", "a"),
        question("q3", "c1", "a"),
        question("q4", "c2", "b"),
      ],
    });

    expect(result).toEqual({
      categories: [
        {
          id: "c2",
          name: "Category c2",
          icon: "rocket",
          questions: [
            { id: "q2", question: "Question q2", answer: "Answer q2" },
            { id: "q4", question: "Question q4", answer: "Answer q4" },
          ],
        },
        {
          id: "c1",
          name: "Category c1",
          icon: "rocket",
          questions: [
            { id: "q3", question: "Question q3", answer: "Answer q3" },
            { id: "q1", question: "Question q1", answer: "Answer q1" },
          ],
        },
      ],
    });
  });

  it("leaves out draft questions", async () => {
    const result = await run({
      "faq-categories": [category("c1", "a")],
      faqs: [
        question("q1", "c1", "a"),
        question("q2", "c1", "b", { _status: "draft" }),
      ],
    });

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]?.questions.map((q) => q.id)).toEqual(["q1"]);
  });

  it("drops a category whose questions are all drafts", async () => {
    const result = await run({
      "faq-categories": [category("c1", "a"), category("c2", "b")],
      faqs: [
        question("q1", "c1", "a", { _status: "draft" }),
        question("q2", "c2", "a"),
      ],
    });

    expect(result.categories.map((c) => c.id)).toEqual(["c2"]);
  });

  it("returns { categories: [] } when there is no content", async () => {
    expect(await run({})).toEqual({ categories: [] });
  });

  it("works for a guest", async () => {
    const payload = createFakePayload({
      collections: {
        "faq-categories": [category("c1", "a")],
        faqs: [question("q1", "c1", "a")],
      },
    });
    const ctx = mockContext({ payload });
    expect(ctx.user).toBeNull();

    const result = await call(faqRouter.get, undefined, { context: ctx });
    expect(result.categories).toHaveLength(1);
  });

  it("keeps line breaks in answers", async () => {
    const result = await run({
      "faq-categories": [category("c1", "a")],
      faqs: [question("q1", "c1", "a", { answer: "A\n\nB" })],
    });

    expect(result.categories[0]?.questions[0]?.answer).toBe("A\n\nB");
  });
});
