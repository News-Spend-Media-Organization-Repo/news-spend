import { FAQ_ICONS, FAQ_SEED } from "@news-spend-media/payload/lib/faqSeed";
import { QuestionIcon } from "#/lib/icons";
import type { FaqSection } from "../faqFallback";
import { FAQ_FALLBACK } from "../faqFallback";
import { faqIcon } from "../faqIcons";
import { filterFaq, hasSearchTerms } from "../filterFaq";

const section = (
  name: string,
  questions: Array<{ question: string; answer: string }>
): FaqSection => ({
  id: name,
  name,
  icon: "help-circle",
  questions: questions.map((q, i) => ({ id: `${name}-${i}`, ...q })),
});

describe("filterFaq", () => {
  it("returns every category unchanged, total = questions.length, for an empty query", () => {
    const result = filterFaq(FAQ_FALLBACK, "");
    expect(result).toHaveLength(FAQ_FALLBACK.length);
    for (const [i, cat] of result.entries()) {
      expect(cat.questions).toEqual(FAQ_FALLBACK[i]?.questions);
      expect(cat.total).toBe(cat.questions.length);
    }
  });

  it('treats "  " and "?" as an empty query', () => {
    expect(filterFaq(FAQ_FALLBACK, "  ")).toHaveLength(FAQ_FALLBACK.length);
    expect(filterFaq(FAQ_FALLBACK, "?")).toHaveLength(FAQ_FALLBACK.length);
    expect(filterFaq(FAQ_FALLBACK, " ? ! ")).toHaveLength(FAQ_FALLBACK.length);
  });

  it('matches when every word appears in question or answer: "claim prize"', () => {
    const result = filterFaq(FAQ_FALLBACK, "claim prize");
    const questions = result.flatMap((c) => c.questions.map((q) => q.question));
    expect(questions).toContain(
      "How long do I have to claim a giveaway prize?"
    );
  });

  it("ignores case and accents", () => {
    const cats = [
      section("Fr", [{ question: "Où est l'Économie?", answer: "x" }]),
    ];
    expect(filterFaq(cats, "ECONOMIE")).toHaveLength(1);
    expect(filterFaq(cats, "ou est")).toHaveLength(1);
  });

  it("keeps ₦, digits and punctuation inside words", () => {
    expect(filterFaq(FAQ_FALLBACK, "₦50,000").length).toBeGreaterThan(0);
    expect(filterFaq(FAQ_FALLBACK, "7–10").length).toBeGreaterThan(0);
  });

  it("drops categories with no matches and keeps total as the full count", () => {
    const cats = [
      section("A", [
        { question: "alpha one", answer: "a" },
        { question: "beta two", answer: "b" },
      ]),
      section("B", [{ question: "gamma", answer: "c" }]),
    ];
    const result = filterFaq(cats, "alpha");
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("A");
    expect(result[0]?.questions).toHaveLength(1);
    expect(result[0]?.total).toBe(2);
  });

  it("returns [] when nothing matches", () => {
    expect(filterFaq(FAQ_FALLBACK, "zzzxqj")).toEqual([]);
  });
});

describe("faqIcon", () => {
  it("maps every FAQ_ICONS key and falls back to QuestionIcon for unknown", () => {
    for (const key of FAQ_ICONS) {
      expect(faqIcon(key)).toBeDefined();
    }
    expect(faqIcon("help-circle")).toBe(QuestionIcon);
    expect(faqIcon("unknown")).toBe(QuestionIcon);
    const distinct = new Set(
      FAQ_ICONS.filter((k) => k !== "help-circle").map((k) => faqIcon(k))
    );
    expect(distinct.size).toBe(FAQ_ICONS.length - 1);
    expect(distinct.has(QuestionIcon)).toBe(false);
  });
});

describe("FAQ_FALLBACK", () => {
  it("has 8 categories and 22 questions", () => {
    expect(FAQ_FALLBACK).toHaveLength(8);
    expect(FAQ_FALLBACK.flatMap((c) => c.questions)).toHaveLength(22);
    expect(FAQ_FALLBACK).toHaveLength(FAQ_SEED.length);
    expect(FAQ_FALLBACK[1]?.id).toBe("fallback-1");
    expect(FAQ_FALLBACK[1]?.questions[0]?.id).toBe("fallback-1-0");
  });
});

describe("hasSearchTerms", () => {
  it.each(["", "  ", "?", " ? ! "])("is false for %j", (query) => {
    expect(hasSearchTerms(query)).toBe(false);
  });

  it.each(["claim", "₦50,000"])("is true for %j", (query) => {
    expect(hasSearchTerms(query)).toBe(true);
  });
});
