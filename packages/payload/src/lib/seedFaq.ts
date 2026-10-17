import type { Payload, PayloadRequest } from "payload";

import { FAQ_SEED } from "./faqSeed";

/**
 * Writes the owner's FAQ into an empty CMS. Skips when either collection
 * already has a row so a re-run never duplicates or overwrites edits. Counting
 * `faqs` without `draft` still sees unpublished drafts, since they live in the
 * main table.
 *
 * Questions are created one at a time: the orderable join hands out an
 * increasing order key per create, so parallel creates would scramble the seed
 * order. `req` is passed through so the writes join the migration's transaction.
 */
export const seedFaqIfEmpty = async (
  payload: Pick<Payload, "count" | "create">,
  req?: PayloadRequest
): Promise<"seeded" | "skipped"> => {
  const categories = await payload.count({
    collection: "faq-categories",
    req,
  });
  const faqs = await payload.count({ collection: "faqs", req });
  if (categories.totalDocs > 0 || faqs.totalDocs > 0) {
    return "skipped";
  }

  const created: Array<{
    id: string;
    questions: (typeof FAQ_SEED)[number]["questions"];
  }> = [];
  for (const category of FAQ_SEED) {
    const { id } = await payload.create({
      collection: "faq-categories",
      data: { name: category.name, icon: category.icon },
      req,
    });
    created.push({ id, questions: category.questions });
  }

  for (const { id, questions } of created) {
    for (const { question, answer } of questions) {
      await payload.create({
        collection: "faqs",
        data: { question, answer, category: id, _status: "published" },
        req,
      });
    }
  }

  return "seeded";
};
