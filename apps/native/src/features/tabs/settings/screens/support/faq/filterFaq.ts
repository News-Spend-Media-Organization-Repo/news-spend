import type { FaqSection } from "./faqFallback";

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** Words of the query, with surrounding punctuation ("claim?") stripped. */
const queryWords = (query: string): string[] =>
  normalize(query)
    .split(" ")
    .map((word) => word.replace(/^[\p{P}]+|[\p{P}]+$/gu, ""))
    .filter((word) => word.length > 0);

/**
 * Keeps the questions whose text contains every query word. Categories left
 * empty are dropped; `total` stays the category's full count so the UI can
 * show "2 of 5".
 */
export const filterFaq = (
  categories: FaqSection[],
  query: string
): Array<FaqSection & { total: number }> => {
  const words = queryWords(query);

  if (words.length === 0) {
    return categories.map((category) => ({
      ...category,
      total: category.questions.length,
    }));
  }

  const result: Array<FaqSection & { total: number }> = [];
  for (const category of categories) {
    const questions = category.questions.filter((q) => {
      const haystack = normalize(`${q.question} ${q.answer}`);
      return words.every((word) => haystack.includes(word));
    });
    if (questions.length > 0) {
      result.push({ ...category, questions, total: category.questions.length });
    }
  }
  return result;
};
