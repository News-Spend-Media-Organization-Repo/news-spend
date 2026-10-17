import {
  FAQ_CATEGORY_ORDER_FIELD,
  FAQ_QUESTION_ORDER_FIELD,
} from "@news-spend-media/payload/lib/faqFields";
import { openapi } from "@orpc/openapi";
import z from "zod";

import { publicProcedure } from "..";

const FaqQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
});

const FaqCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  questions: z.array(FaqQuestionSchema),
});

const FaqOutputSchema = z.object({
  categories: z.array(FaqCategorySchema),
});

type FaqQuestion = z.infer<typeof FaqQuestionSchema>;

const get = publicProcedure
  .meta(
    openapi({
      method: "GET",
      path: "/faq",
      tags: ["faq"],
      summary: "Published FAQ, grouped by category",
    })
  )
  .output(FaqOutputSchema)
  .handler(async ({ context }) => {
    const { payload } = context;

    const [categories, faqs] = await Promise.all([
      payload.find({
        collection: "faq-categories",
        depth: 0,
        pagination: false,
        limit: 0,
        sort: FAQ_CATEGORY_ORDER_FIELD,
      }),
      payload.find({
        collection: "faqs",
        depth: 0,
        pagination: false,
        limit: 0,
        where: { _status: { equals: "published" } },
        sort: FAQ_QUESTION_ORDER_FIELD,
      }),
    ]);

    // Questions arrive already sorted, so pushing keeps their stored order.
    const questionsByCategory = new Map<string, FaqQuestion[]>();
    for (const faq of faqs.docs) {
      // depth: 0 leaves `category` as the id.
      const categoryId =
        typeof faq.category === "string" ? faq.category : faq.category.id;
      const questions = questionsByCategory.get(categoryId) ?? [];
      questions.push({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
      });
      questionsByCategory.set(categoryId, questions);
    }

    return {
      categories: categories.docs.flatMap((category) => {
        const questions = questionsByCategory.get(category.id);
        if (!questions) {
          return [];
        }
        return [
          {
            id: category.id,
            name: category.name,
            icon: category.icon,
            questions,
          },
        ];
      }),
    };
  });

export const faqRouter = { get };
