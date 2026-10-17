/**
 * Hidden sort columns Payload adds for `orderable`. Both names come from the
 * generated `FaqCategory` and `Faq` types in `payload-types.ts`, so re-check
 * them there if a collection or join field is renamed.
 */

/** `orderable: true` on the faq-categories collection. */
export const FAQ_CATEGORY_ORDER_FIELD = "_order";

/** `orderable: true` on the `questions` join, stored on the faqs rows. */
export const FAQ_QUESTION_ORDER_FIELD = "_faqs_questions_order";
