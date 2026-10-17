import { FAQ_SEED } from "@news-spend-media/payload/lib/faqSeed";
import type { RouterOutputs } from "#/lib/orpc";

/** Named to avoid clashing with Payload's generated `FaqCategory`. */
export type FaqSection = RouterOutputs["faq"]["get"]["categories"][number];

/**
 * The FAQ as first shipped, shown while the CMS copy loads or when it can't
 * be reached. Ids are positional because these rows have no CMS identity.
 */
export const FAQ_FALLBACK: FaqSection[] = FAQ_SEED.map((category, i) => ({
  id: `fallback-${i}`,
  name: category.name,
  icon: category.icon,
  questions: category.questions.map((q, j) => ({
    id: `fallback-${i}-${j}`,
    question: q.question,
    answer: q.answer,
  })),
}));
